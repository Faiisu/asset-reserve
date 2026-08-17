import { Allow, IsOptional, IsString } from "class-validator";

export class MicrosoftCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  /** Present when the user denied consent or another auth error occurred. */
  @IsOptional()
  @IsString()
  error?: string;

  // Microsoft's actual extra callback params -- same class of bug already
  // fixed for Google's scope/authuser/prompt/iss (the app's global
  // ValidationPipe is whitelist + forbidNonWhitelisted, so any undeclared
  // property 422s). @Allow() whitelists a property without adding a real
  // constraint.
  @Allow()
  session_state?: string;

  @Allow()
  error_description?: string;
}
