export interface ServerConfig {
  host: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received: ${rawPort}`);
  }

  const host = env.HOST ?? "127.0.0.1";
  if (host.trim().length === 0) {
    throw new Error("HOST must not be empty");
  }

  return { host, port };
}
