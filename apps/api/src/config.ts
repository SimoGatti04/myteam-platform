export interface ServerConfig {
  host: string;
  port: number;
}

export interface LogtoAdminConfig {
  issuer: string;
  audience: string;
  requiredScope: string;
  jwksUrl?: string;
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

export function loadLogtoAdminConfig(env: NodeJS.ProcessEnv = process.env): LogtoAdminConfig | undefined {
  const issuer = env.LOGTO_ISSUER?.trim() ?? "";
  const audience = env.LOGTO_AUDIENCE?.trim() ?? "";
  const jwksUrl = env.LOGTO_JWKS_URL?.trim() ?? "";
  if (!issuer && !audience && !jwksUrl) return undefined;
  if (!issuer || !audience) throw new Error("LOGTO_ISSUER and LOGTO_AUDIENCE must be configured together");

  const issuerUrl = new URL(issuer);
  const jwksUri = jwksUrl ? new URL(jwksUrl) : undefined;
  if (
    issuerUrl.protocol !== "https:" || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash ||
    (jwksUri && (jwksUri.protocol !== "https:" || jwksUri.username || jwksUri.password || jwksUri.search || jwksUri.hash))
  ) {
    throw new Error("Logto issuer and JWKS URL must be clean HTTPS URLs");
  }

  return {
    issuer: issuerUrl.toString(),
    audience,
    requiredScope: env.LOGTO_ADMIN_SCOPE?.trim() || "platform:admin",
    ...(jwksUri ? { jwksUrl: jwksUri.toString() } : {}),
  };
}
