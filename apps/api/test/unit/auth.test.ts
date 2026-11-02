import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { DomainError } from "../../src/platform/errors.js";
import { createLogtoAdminTokenVerifier } from "../../src/platform/auth.js";

test("Logto verifier accepts a correctly signed admin access token", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const server = createServer((request, response) => {
    if (request.url !== "/oidc/jwks") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const address = server.address() as AddressInfo;
  const issuer = `http://127.0.0.1:${address.port}/oidc`;
  const verifier = await createLogtoAdminTokenVerifier({
    issuer,
    audience: "https://api.example.test",
    requiredScope: "platform:admin",
    jwksUrl: `${issuer}/jwks`,
  });
  const makeToken = (options: { audience?: string; scope?: string; expires?: string; noExpiry?: boolean } = {}) => {
    const token = new SignJWT({ scope: options.scope ?? "platform:admin profile:read" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(options.audience ?? "https://api.example.test")
      .setSubject("admin-subject")
      .setIssuedAt();
    if (!options.noExpiry) token.setExpirationTime(options.expires ?? "5m");
    return token.sign(privateKey);
  };

  const token = await makeToken();
  assert.deepEqual(await verifier(`Bearer ${token}`), { subject: "admin-subject" });

  await assert.rejects(verifier(undefined), (error: unknown) =>
    error instanceof DomainError && error.statusCode === 401 && error.code === "authentication_required",
  );

  const wrongAudience = await makeToken({ audience: "web-client-id" });
  await assert.rejects(verifier(`Bearer ${wrongAudience}`), (error: unknown) =>
    error instanceof DomainError && error.statusCode === 401 && error.code === "invalid_access_token",
  );

  const wrongScope = await makeToken({ scope: "profile:read" });
  await assert.rejects(verifier(`Bearer ${wrongScope}`), (error: unknown) =>
    error instanceof DomainError && error.statusCode === 403 && error.code === "insufficient_permissions",
  );

  const expired = await makeToken({ expires: "-1m" });
  await assert.rejects(verifier(`Bearer ${expired}`), (error: unknown) =>
    error instanceof DomainError && error.statusCode === 401 && error.code === "invalid_access_token",
  );

  const missingExpiration = await makeToken({ noExpiry: true });
  await assert.rejects(verifier(`Bearer ${missingExpiration}`), (error: unknown) =>
    error instanceof DomainError && error.statusCode === 401 && error.code === "invalid_access_token",
  );
});
