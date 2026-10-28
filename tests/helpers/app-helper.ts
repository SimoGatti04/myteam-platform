import type { FastifyInstance } from "fastify";
import { createApp } from "../../apps/api/src/app.js";
import { createTestDatabase, type TestDatabase } from "./test-db.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";

export interface TestAppContext {
  app: FastifyInstance;
  db: TestDatabase;
  adminHeaders: { authorization: string };
  unprivilegedHeaders: { authorization: string };
  invalidTokenHeaders: { authorization: string };
  actorSubject: string;
}

export function createTestApp(): TestAppContext {
  const db = createTestDatabase();
  const actorSubject = "admin-user-q1";

  const app = createApp({
    logger: false,
    pool: db.pool,
    verifyAdminToken: async (header) => {
      if (!header) {
        throw new DomainError(401, "authentication_required");
      }
      if (header === "Bearer valid-admin-token") {
        return { subject: actorSubject };
      }
      if (header === "Bearer unprivileged-token") {
        throw new DomainError(403, "insufficient_permissions");
      }
      throw new DomainError(401, "invalid_access_token");
    },
  });

  return {
    app,
    db,
    adminHeaders: { authorization: "Bearer valid-admin-token" },
    unprivilegedHeaders: { authorization: "Bearer unprivileged-token" },
    invalidTokenHeaders: { authorization: "Bearer garbage-token" },
    actorSubject,
  };
}
