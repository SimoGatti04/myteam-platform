import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp();

try {
  await app.listen(config);
} catch (error) {
  app.log.error(error, "Unable to start API server");
  await app.close();
  process.exitCode = 1;
}
