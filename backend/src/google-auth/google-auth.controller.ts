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
import { GoogleCallbackQueryDto } from "./google-auth.dto.js";
import { GoogleAuthService } from "./google-auth.service.js";

const SCOPE = ["openid", "email", "profile"];

/**
 * The only two ways a Google identity ever touches this app:
 * - /connect (authenticated): the ONLY way a Google identity ever gets
 *   linked to a user -- this is what the mandatory-link gate sends a
 *   freshly-created user through, and ties the identity to whoever is
 *   currently logged in. Returns the Google URL as JSON rather than
 *   redirecting directly -- this route requires a Bearer token, which a
 *   plain `<a href>` navigation can't send, so the frontend fetches this
 *   first (attaching the token like any other authenticated call) and
 *   navigates the browser to the returned URL itself.
 * - /login (public): only ever succeeds for an identity that's already
 *   linked (looked up by [provider, providerUserId]) -- never by email,
 *   never auto-provisioning. This app is invite-only. No auth needed to
 *   initiate, so this one *is* a plain redirect a real `<a href>` can hit
 *   directly.
 * Both funnel through the same /callback, discriminated by the signed
 * `state` param's `purpose`. State signing/verification and session
 * issuance are provider-agnostic and delegated to
 * ExternalIdentitySessionService, shared with microsoft-auth/.
 */
@Controller("auth/google")
export class GoogleAuthController {
  constructor(
    private readonly googleAuth: GoogleAuthService,
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
    return { url: this.googleAuth.buildAuthUrl(SCOPE, signed, { forceConsent: true }) };
  }

  @Public()
  @SkipAccountLinkCheck()
  @Get("login")
  async login(@Res() reply: FastifyReply) {
    this.assertConfigured();
    const signed = await this.session.signState({ purpose: "login" });
    this.redirect(reply, this.googleAuth.buildAuthUrl(SCOPE, signed));
  }

  @Public()
  @SkipAccountLinkCheck()
  @Get("callback")
  async callback(@Query() query: GoogleCallbackQueryDto, @Res() reply: FastifyReply) {
    const frontendBaseUrl = appConfig.frontendBaseUrl();
    if (!appConfig.googleAuth()) {
      this.redirect(reply, `${frontendBaseUrl}/login?googleError=google_not_configured`);
      return;
    }
    if (query.error || !query.code || !query.state) {
      this.redirect(reply, `${frontendBaseUrl}/login?googleError=google_failed`);
      return;
    }

    let state: ExternalState;
    try {
      state = await this.session.verifyState(query.state);
    } catch {
      this.redirect(reply, `${frontendBaseUrl}/login?googleError=google_failed`);
      return;
    }

    try {
      const identity = await this.googleAuth.exchangeCode(query.code);
      if (state.purpose === "connect") {
        await this.handleConnect(state.userId, identity);
        this.redirect(reply, `${frontendBaseUrl}/connect-account/callback?ok=1`);
        return;
      }
      await this.handleLogin(identity, reply, frontendBaseUrl);
    } catch (error) {
      console.warn("[google-auth] callback failed:", error);
      const target = state.purpose === "connect" ? "/connect-account" : "/login";
      this.redirect(reply, `${frontendBaseUrl}${target}?googleError=google_failed`);
    }
  }

  /**
   * Always succeeds for the authenticated actor once the identity link
   * itself is established -- email/profile population are best-effort
   * extras, not conditions for success (a cosmetic email conflict must
   * never leave a user stuck unable to satisfy the mandatory-link gate).
   */
  private async handleConnect(userId: string, identity: ExternalIdentity): Promise<void> {
    try {
      await this.prisma.userAuthIdentity.upsert({
        where: { userId_provider: { userId, provider: "google" } },
        update: { providerUserId: identity.sub },
        create: {
          id: randomUUID(),
          userId,
          provider: "google",
          providerUserId: identity.sub,
        },
      });
    } catch (error) {
      if (this.prismaCode(error) === "P2002") {
        throw new Error("This Google account is already linked to a different user.");
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
        // A different user already holds this email -- the identity link
        // above already succeeded, so leave email unset rather than fail
        // the whole connect over it.
        console.warn(
          `[google-auth] could not populate email for user ${userId}: already claimed by another account`,
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
      where: { provider_providerUserId: { provider: "google", providerUserId: identity.sub } },
    });
    if (!link) {
      this.redirect(reply, `${frontendBaseUrl}/login?googleError=not_linked`);
      return;
    }
    const session = await this.session.issueSession(link.userId);
    if (!session) {
      this.redirect(reply, `${frontendBaseUrl}/login?googleError=inactive`);
      return;
    }
    this.redirect(
      reply,
      `${frontendBaseUrl}/auth/callback?token=${encodeURIComponent(session.accessToken)}`,
    );
  }

  /**
   * Fastify v5's reply.redirect(url) only defaults to 302 when no status
   * has been set on the reply yet -- Nest's Fastify adapter pre-sets 200
   * before the handler runs, so an explicit code is required here or
   * every one of these "redirects" silently comes back as a 200 with a
   * Location header a browser never follows.
   */
  private redirect(reply: FastifyReply, url: string): void {
    reply.redirect(url, 302);
  }

  private assertConfigured(): void {
    if (!appConfig.googleAuth()) {
      throw new ApiException(
        503,
        "GOOGLE_AUTH_NOT_CONFIGURED",
        "Google sign-in is not configured.",
      );
    }
  }

  private prismaCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  }
}
