import "reflect-metadata";
import helmet from "@fastify/helmet";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { AppModule } from "./app.module.js";
import { ApiException } from "./common/api-exception.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { appConfig } from "./config.js";

function validationFields(
  errors: Array<{
    property: string;
    constraints?: Record<string, string>;
    children?: unknown[];
  }>,
) {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const message = error.constraints
      ? Object.values(error.constraints)[0]
      : undefined;
    fields[error.property] = message ?? "The field is invalid.";
  }
  return fields;
}

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    trustProxy: appConfig.trustProxy,
    genReqId: (request: {
      headers: Record<string, string | string[] | undefined>;
    }) => {
      const supplied = request.headers["x-request-id"];
      return typeof supplied === "string" &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
        ? supplied
        : randomUUID();
    },
  });
  adapter.getInstance().addHook("onSend", (request, reply, payload, done) => {
    reply.header("X-Request-Id", request.id);
    done(null, payload);
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: appConfig.corsOrigins, credentials: false });
  await app.register(helmet);

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
  });

  const uploadsDir = resolve(process.cwd(), "uploads");
  if (!existsSync(uploadsDir)) {
    try {
      mkdirSync(uploadsDir, { recursive: true });
    } catch (err) {
      Logger.warn(`Could not create uploads directory: ${err}`, "Bootstrap");
    }
  }

  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new ApiException(
          422,
          "VALIDATION_ERROR",
          "The request contains invalid fields.",
          validationFields(errors),
        ),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const contractPath = resolve(
    process.cwd(),
    process.env.OPENAPI_CONTRACT_PATH ??
      "../docs/backend_spec/contracts/dist/openapi.bundle.yaml",
  );
  if (existsSync(contractPath)) {
    const contract = parse(readFileSync(contractPath, "utf8")) as OpenAPIObject;
    SwaggerModule.setup("api/docs", app, contract, {
      jsonDocumentUrl: "api/docs/openapi.json",
    });
  } else {
    Logger.warn(
      `OpenAPI contract not found at ${contractPath}; Swagger UI is disabled.`,
      "Bootstrap",
    );
  }

  await app.listen(appConfig.port, "0.0.0.0");
  Logger.log(
    `Backend listening on http://localhost:${appConfig.port}`,
    "Bootstrap",
  );
}

void bootstrap();
