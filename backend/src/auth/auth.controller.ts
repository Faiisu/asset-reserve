import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedActor } from "./auth.types.js";
import {
  CurrentActor,
  Public,
  SkipAccountLinkCheck,
} from "./auth.decorators.js";
import { LoginDto } from "./auth.dto.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  login(@Body() input: LoginDto) {
    return this.auth.login(input.username, input.password);
  }

  // Exempt from the mandatory-account-link gate: a not-yet-linked user
  // still needs to know who they are (frontend reads linkedProviders off
  // this to decide whether to redirect) and needs to be able to log out.
  @SkipAccountLinkCheck()
  @Get("me")
  me(@CurrentActor() actor: AuthenticatedActor) {
    return { session: actor };
  }

  @SkipAccountLinkCheck()
  @Post("logout")
  @HttpCode(204)
  logout(): void {}
}

@Controller("bff")
export class SessionBffController {
  @SkipAccountLinkCheck()
  @Get("session")
  session(@CurrentActor() actor: AuthenticatedActor) {
    return { session: actor };
  }
}
