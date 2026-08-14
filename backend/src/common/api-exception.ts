import { HttpException } from "@nestjs/common";

export type ErrorFields = Record<string, string>;

export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fields?: ErrorFields,
  ) {
    super(message, status);
  }
}
