import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MicrosoftAuthController } from "./microsoft-auth.controller.js";
import { MicrosoftAuthService } from "./microsoft-auth.service.js";

@Module({
  // Reuses AuthModule's ExternalIdentitySessionService (state
  // signing/verification, session issuance) -- see google-auth.module.ts
  // for the identical pattern.
  imports: [AuthModule],
  controllers: [MicrosoftAuthController],
  providers: [MicrosoftAuthService],
})
export class MicrosoftAuthModule {}
