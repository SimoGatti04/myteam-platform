import { Type, type Static } from "@sinclair/typebox";

/** Process liveness only; it does not claim database or dependency readiness. */
export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal("ok"),
    service: Type.Literal("myteam-platform-api"),
    apiVersion: Type.Literal("v1"),
  },
  { additionalProperties: false },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

/** Application readiness to serve traffic, including live PostgreSQL connectivity. */
export const ReadyOkResponseSchema = Type.Object(
  {
    status: Type.Literal("ready"),
    service: Type.Literal("myteam-platform-api"),
    apiVersion: Type.Literal("v1"),
    database: Type.Literal("connected"),
  },
  { additionalProperties: false },
);

export type ReadyOkResponse = Static<typeof ReadyOkResponseSchema>;

/** Application not ready (503 Service Unavailable). Fail-closed, no internal details. */
export const ReadyUnavailableResponseSchema = Type.Object(
  {
    status: Type.Literal("not_ready"),
    service: Type.Literal("myteam-platform-api"),
    apiVersion: Type.Literal("v1"),
    error: Type.Literal("service_unavailable"),
  },
  { additionalProperties: false },
);

export type ReadyUnavailableResponse = Static<typeof ReadyUnavailableResponseSchema>;
