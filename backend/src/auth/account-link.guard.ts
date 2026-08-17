import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { appConfig } from "../config.js";
import { ApiException } from "../common/api-exception.js";
import { SKIP_ACCOUNT_LINK_KEY } from "./auth.decorators.js";

/**
 * Enforces mandatory external-account linking: once REQUIRE_ACCOUNT_LINK
 * is on (see appConfig.requireAccountLink()), every authenticated route
 * except the ones explicitly exempted via @SkipAccountLinkCheck() 403s
 * for a user with no linked provider. Satisfied by linking *any*
 * supported provider (Google or Microsoft) -- not one specifically.
 * Registered as the third APP_GUARD in auth.module.ts, after
 * AuthenticationGuard (needs request.actor already populated) and before
 * AccessGuard (a link-required block takes precedence over a
 * permission-denied message).
 */
@Injectable()
export class AccountLinkGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    if (!appConfig.requireAccountLink()) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ACCOUNT_LINK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    // No actor means this is a @Public() route with no explicit skip --
    // nothing to check here, that's AuthenticationGuard's concern.
    if (!actor) return true;

    if (actor.user.linkedProviders.length === 0) {
      throw new ApiException(
        403,
        "ACCOUNT_LINK_REQUIRED",
        "Link a Google or Microsoft account before continuing.",
      );
    }
    return true;
  }
}
