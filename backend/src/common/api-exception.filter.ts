import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiException } from "./api-exception.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const requestId = String(request.id);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred.";
    let fields: Record<string, string> | undefined;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code =
        status === 404
          ? "NOT_FOUND"
          : status === 429
            ? "RATE_LIMITED"
            : status === 401
              ? "AUTHENTICATION_REQUIRED"
              : status === 403
                ? "PERMISSION_DENIED"
                : "INVALID_REQUEST";
      message = exception.message;
    } else if (
      typeof exception === "object" &&
      exception !== null &&
      "code" in exception
    ) {
      const prismaCode = String((exception as { code: unknown }).code);
      if (prismaCode === "P2034") {
        status = 409;
        code = "CONCURRENT_MODIFICATION";
        message =
          "The operation conflicted with another request. Please retry.";
      } else {
        this.logger.error(
          { requestId, exception },
          "Unhandled persistence exception",
        );
      }
    } else {
      this.logger.error(
        { requestId, exception },
        "Unhandled request exception",
      );
    }

    const error: Record<string, unknown> = { code, message };
    if (fields && Object.keys(fields).length > 0) error.fields = fields;
    error.requestId = requestId;

    if (status === 401) reply.header("WWW-Authenticate", "Bearer");
    void reply.status(status).header("X-Request-Id", requestId).send({ error });
  }
}
