import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedActor } from "./auth.types.js";
import { CurrentActor, Public } from "./auth.decorators.js";
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
    return this.auth.login(input.email, input.password);
  }

  @Get("me")
  me(@CurrentActor() actor: AuthenticatedActor) {
    return { session: actor };
  }

  @Post("logout")
  @HttpCode(204)
  logout(): void {}
}

@Controller("bff")
export class SessionBffController {
  @Get("session")
  session(@CurrentActor() actor: AuthenticatedActor) {
    return { session: actor };
  }
}
