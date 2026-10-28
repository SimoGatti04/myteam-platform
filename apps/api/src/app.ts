import Fastify, { type FastifyInstance } from "fastify";
import { HealthResponseSchema } from "@myteam/contracts";

export interface AppOptions {
  logger?: boolean;
}

export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

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

  return app;
}
