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

  // Shutdown idempotente: un secondo Ctrl+C non deve interrompere il cleanup dello schema.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Rete di sicurezza: se il cleanup si blocca, esce comunque dopo 15 s.
    const hardExit = setTimeout(() => process.exit(1), 15_000);
    hardExit.unref();
    try {
      await Promise.race([
        app.close(),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    } catch {}
    try {
      await ctx.cleanup();
    } catch {}
    clearTimeout(hardExit);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch(err => {
  console.error("Error starting test API:", err);
  process.exit(1);
});
