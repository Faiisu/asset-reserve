import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ApiException } from "../common/api-exception.js";
import { IS_PUBLIC_KEY } from "./auth.decorators.js";
import { buildSessionContext } from "./session-context.js";
import { SessionService } from "./session.service.js";

type AccessClaims = { sub?: string };

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(
    reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {
    this.reflector = reflector ?? new Reflector();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token)
      throw new ApiException(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
      );

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new ApiException(
        401,
        "AUTHENTICATION_REQUIRED",
        "The access token is invalid or expired.",
      );
    }
    if (!claims.sub)
      throw new ApiException(
        401,
        "AUTHENTICATION_REQUIRED",
        "The access token is invalid.",
      );

    const source = await this.sessions.findSource(claims.sub);
    if (!source)
      throw new ApiException(
        401,
        "AUTHENTICATION_REQUIRED",
        "The access token is invalid.",
      );
    if (!source.isActive)
      throw new ApiException(
        403,
        "ACCOUNT_INACTIVE",
        "The account is inactive.",
      );
    request.actor = buildSessionContext(source);
    return true;
  }
}
