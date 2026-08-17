import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { appConfig } from "../config.js";
import { ApiException } from "../common/api-exception.js";
import { SKIP_GOOGLE_LINK_KEY } from "./auth.decorators.js";

/**
 * Enforces mandatory Google account linking: once REQUIRE_GOOGLE_LINK is
 * on (see appConfig.requireGoogleLink()), every authenticated route
 * except the ones explicitly exempted via @SkipGoogleLinkCheck() 403s for
 * a user who hasn't linked yet. Registered as the third APP_GUARD in
 * auth.module.ts, after AuthenticationGuard (needs request.actor already
 * populated) and before AccessGuard (a link-required block takes
 * precedence over a permission-denied message).
 */
@Injectable()
export class GoogleLinkGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    if (!appConfig.requireGoogleLink()) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_GOOGLE_LINK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    // No actor means this is a @Public() route with no explicit skip --
    // nothing to check here, that's AuthenticationGuard's concern.
    if (!actor) return true;

    if (!actor.user.googleLinked) {
      throw new ApiException(
        403,
        "GOOGLE_LINK_REQUIRED",
        "Link your Google account before continuing.",
      );
    }
    return true;
  }
}
