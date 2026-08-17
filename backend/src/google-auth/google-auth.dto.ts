import { Allow, IsOptional, IsString } from "class-validator";

export class GoogleCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  /** Present when the user denied consent on Google's screen. */
  @IsOptional()
  @IsString()
  error?: string;

  // Google appends these to the callback redirect too -- we never read
  // them, but the app's global ValidationPipe (whitelist: true,
  // forbidNonWhitelisted: true) 422s on any query param not declared
  // here, so they still need to be listed. @Allow() whitelists a
  // property without adding a real constraint.
  @Allow()
  scope?: string;

  @Allow()
  authuser?: string;

  @Allow()
  prompt?: string;

  @Allow()
  iss?: string;

  /** Hosted-domain claim, present for Google Workspace accounts. */
  @Allow()
  hd?: string;
}
