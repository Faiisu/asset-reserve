import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "argon2";
import { randomUUID } from "node:crypto";
import { appConfig } from "../config.js";
import { ApiException } from "../common/api-exception.js";
import { SessionService } from "./session.service.js";

@Injectable()
export class AuthService {
  private readonly dummyHash = hash("not-a-real-user-password", { type: 2 });

  constructor(
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const source = await this.sessions.findPasswordUser(email);
    const candidateHash = source?.passwordHash ?? (await this.dummyHash);
    const valid = await verify(candidateHash, password).catch(() => false);
    if (!source || !valid) {
      throw new ApiException(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }
    if (!source.isActive)
      throw new ApiException(
        403,
        "ACCOUNT_INACTIVE",
        "The account is inactive.",
      );

    const session = await this.sessions.getActor(source.id);
    if (!session)
      throw new ApiException(
        403,
        "ACCOUNT_INACTIVE",
        "The account is inactive.",
      );
    const accessToken = await this.jwt.signAsync({
      sub: source.id,
      jti: randomUUID(),
    });
    return {
      accessToken,
      tokenType: "Bearer" as const,
      expiresIn: appConfig.jwtAccessTtlSeconds,
      session,
    };
  }
}
