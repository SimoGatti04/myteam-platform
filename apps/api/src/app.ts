import Fastify, { type FastifyInstance } from "fastify";
import {
  HealthResponseSchema,
  ReadyOkResponseSchema,
  ReadyUnavailableResponseSchema,
} from "@myteam/contracts";
import type { Pool } from "pg";
import { checkDatabaseReadiness } from "./persistence/readiness.js";
import type { AdminTokenVerifier } from "./platform/auth.js";
import { DomainError } from "./platform/errors.js";
import { registerPlatformRoutes } from "./platform/routes.js";

export interface AppOptions {
  logger?: boolean;
  pool?: Pool;
  readinessTimeoutMs?: number;
  verifyAdminToken?: AdminTokenVerifier;
}

export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({ error: error.code });
    }
    if (typeof error === "object" && error !== null && "validation" in error && error.validation) {
      return reply.code(400).send({ error: "request_validation_failed" });
    }
    request.log.error({ err: error }, "Unhandled API error");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "route_not_found" }));

  app.get(
    "/health",
    {
      schema: {
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: "ok" as const,
      service: "myteam-platform-api" as const,
      apiVersion: "v1" as const,
    }),
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: ReadyOkResponseSchema,
          503: ReadyUnavailableResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const result = await checkDatabaseReadiness(options.pool, {
        timeoutMs: options.readinessTimeoutMs,
      });

      if (!result.ok) {
        return reply.code(503).send({
          status: "not_ready" as const,
          service: "myteam-platform-api" as const,
          apiVersion: "v1" as const,
          error: "service_unavailable" as const,
        });
      }

      return reply.code(200).send({
        status: "ready" as const,
        service: "myteam-platform-api" as const,
        apiVersion: "v1" as const,
        database: "connected" as const,
      });
    },
  );

  if (options.pool) {
    registerPlatformRoutes(app, options.pool, options.verifyAdminToken);
  }

  return app;
}
