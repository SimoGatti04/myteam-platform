import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { createTestDatabase, type TestDatabase } from "./test-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = process.env.TARGET_API_DIR
  ? path.resolve(process.env.TARGET_API_DIR)
  : path.resolve(__dirname, "../../apps/api");

const appModule = await import(path.join(apiDir, "src/app.js"));
const errorsModule = await import(path.join(apiDir, "src/platform/errors.js"));

const createApp = appModule.createApp;
const DomainError = errorsModule.DomainError;

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
    verifyAdminToken: async (header: string | undefined) => {
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
