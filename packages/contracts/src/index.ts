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
