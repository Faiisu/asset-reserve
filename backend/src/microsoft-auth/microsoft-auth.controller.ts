import { Controller, Get, Query, Res } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import { appConfig } from "../config.js";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { CurrentActor, Public, SkipAccountLinkCheck } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { ExternalIdentity, ExternalState } from "../auth/external-identity.js";
import { ExternalIdentitySessionService } from "../auth/external-identity-session.service.js";
import { MicrosoftCallbackQueryDto } from "./microsoft-auth.dto.js";
import { MicrosoftAuthService } from "./microsoft-auth.service.js";

const SCOPES = ["openid", "email", "profile"];

/**
 * Mirrors google-auth/google-auth.controller.ts exactly -- same
 * connect/login/callback shape, same "connect is the only way an
 * identity ever links, login only succeeds for one already linked"
 * rule, same reasons for /connect returning JSON instead of redirecting
 * and for the explicit 302 on every redirect() call (see that
 * controller's doc comments for why). See there for the full rationale;
 * only the provider-specific bits (MSAL client, account shape) differ.
 */
@Controller("auth/microsoft")
export class MicrosoftAuthController {
  constructor(
    private readonly microsoftAuth: MicrosoftAuthService,
    private readonly session: ExternalIdentitySessionService,
    private readonly prisma: PrismaService,
  ) {}

  @SkipAccountLinkCheck()
  @Get("connect")
  async connect(@CurrentActor() actor: AuthenticatedActor): Promise<{ url: string }> {
    this.assertConfigured();
    const signed = await this.session.signState({
      purpose: "connect",
      userId: actor.user.id,
    });
    const url = await this.microsoftAuth.buildAuthUrl(SCOPES, signed, this.redirectUri());
    return { url };
  }

  @Public()
  @SkipAccountLinkCheck()
  @Get("login")
  async login(@Res() reply: FastifyReply) {
    this.assertConfigured();
    const signed = await this.session.signState({ purpose: "login" });
    const url = await this.microsoftAuth.buildAuthUrl(SCOPES, signed, this.redirectUri());
    this.redirect(reply, url);
  }

  @Public()
  @SkipAccountLinkCheck()
  @Get("callback")
  async callback(@Query() query: MicrosoftCallbackQueryDto, @Res() reply: FastifyReply) {
    const frontendBaseUrl = appConfig.frontendBaseUrl();
    if (!appConfig.microsoftAuth()) {
      this.redirect(reply, `${frontendBaseUrl}/login?microsoftError=microsoft_not_configured`);
      return;
    }
    if (query.error || !query.code || !query.state) {
      this.redirect(reply, `${frontendBaseUrl}/login?microsoftError=microsoft_failed`);
      return;
    }

    let state: ExternalState;
    try {
      state = await this.session.verifyState(query.state);
    } catch {
      this.redirect(reply, `${frontendBaseUrl}/login?microsoftError=microsoft_failed`);
      return;
    }

    try {
      const identity = await this.microsoftAuth.exchangeCode(
        query.code,
        SCOPES,
        this.redirectUri(),
      );
      if (state.purpose === "connect") {
        await this.handleConnect(state.userId, identity);
        this.redirect(reply, `${frontendBaseUrl}/connect-account/callback?ok=1`);
        return;
      }
      await this.handleLogin(identity, reply, frontendBaseUrl);
    } catch (error) {
      console.warn("[microsoft-auth] callback failed:", error);
      const target = state.purpose === "connect" ? "/connect-account" : "/login";
      this.redirect(reply, `${frontendBaseUrl}${target}?microsoftError=microsoft_failed`);
    }
  }

  /** Same shape as GoogleAuthController.handleConnect() -- see there. */
  private async handleConnect(userId: string, identity: ExternalIdentity): Promise<void> {
    try {
      await this.prisma.userAuthIdentity.upsert({
        where: { userId_provider: { userId, provider: "microsoft" } },
        update: { providerUserId: identity.sub },
        create: {
          id: randomUUID(),
          userId,
          provider: "microsoft",
          providerUserId: identity.sub,
        },
      });
    } catch (error) {
      if (this.prismaCode(error) === "P2002") {
        throw new Error("This Microsoft account is already linked to a different user.");
      }
      throw error;
    }

    if (identity.email && identity.emailVerified) {
      try {
        await this.prisma.user.updateMany({
          where: { id: userId, email: null },
          data: { email: identity.email },
        });
      } catch (error) {
        if (this.prismaCode(error) !== "P2002") throw error;
        console.warn(
          `[microsoft-auth] could not populate email for user ${userId}: already claimed by another account`,
        );
      }
    }

    const existingProfile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!existingProfile && identity.name) {
      await this.prisma.userProfile.create({
        data: { userId, name: identity.name, profilePictureUrl: identity.picture },
      });
    }
  }

  private async handleLogin(
    identity: ExternalIdentity,
    reply: FastifyReply,
    frontendBaseUrl: string,
  ): Promise<void> {
    const link = await this.prisma.userAuthIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: "microsoft", providerUserId: identity.sub },
      },
    });
    if (!link) {
      this.redirect(reply, `${frontendBaseUrl}/login?microsoftError=not_linked`);
      return;
    }
    const session = await this.session.issueSession(link.userId);
    if (!session) {
      this.redirect(reply, `${frontendBaseUrl}/login?microsoftError=inactive`);
      return;
    }
    this.redirect(
      reply,
      `${frontendBaseUrl}/auth/callback?token=${encodeURIComponent(session.accessToken)}`,
    );
  }

  private redirect(reply: FastifyReply, url: string): void {
    reply.redirect(url, 302);
  }

  private redirectUri(): string {
    // Safe to assume configured wherever this is called -- assertConfigured()
    // (or an earlier appConfig.microsoftAuth() null check) already ran.
    return appConfig.microsoftAuth()!.redirectUri;
  }

  private assertConfigured(): void {
    if (!appConfig.microsoftAuth()) {
      throw new ApiException(
        503,
        "MICROSOFT_AUTH_NOT_CONFIGURED",
        "Microsoft sign-in is not configured.",
      );
    }
  }

  private prismaCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  }
}
