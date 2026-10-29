import { createApp } from "../../apps/api/src/app.js";
import { createScopedPostgresContext } from "../helpers/pg-test-helper.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";

async function main() {
  const ctx = await createScopedPostgresContext();
  if (!ctx) {
    console.error("No PostgreSQL context");
    process.exit(1);
  }

  const app = createApp({
    logger: false,
    pool: ctx.scopedPool,
    verifyAdminToken: async (header) => {
      if (header === "Bearer forbidden-token") {
        throw new DomainError(403, "insufficient_permissions");
      }
      if (header === "Bearer test-admin-token") {
        return { subject: "browser-admin-tester" };
      }
      throw new DomainError(401, "authentication_required");
    }
  });

  const address = await app.listen({ host: "127.0.0.1", port: 3000 });
  console.log("FASTIFY_API_READY at", address);

  const shutdown = async () => {
    try {
      await app.close();
      await ctx.cleanup();
    } catch {}
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(err => {
  console.error("Error starting test API:", err);
  process.exit(1);
});
