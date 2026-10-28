import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createApp } from "../../apps/api/src/app.js";
import { createLogtoAdminTokenVerifier } from "../../apps/api/src/platform/auth.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";
import { createTestDatabase } from "../helpers/test-db.js";

const require = createRequire(import.meta.url);
const josePath = require.resolve("jose", { paths: [new URL("../../apps/api", import.meta.url).pathname] });
const { generateKeyPair, exportJWK, SignJWT } = require(josePath);

const issuer = "https://auth.example.test/oidc";
const audience = "https://api.example.test";
const requiredScope = "platform:admin";
const jwksUrl = `${issuer}/jwks`;

async function setupJwtEnvironment() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = { ...(await exportJWK(publicKey)), kid: "test-qa-key", alg: "RS256", use: "sig" };

  // Mock globale per intercettare jwksUrl senza aprire porte TCP di ascolto
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    if (urlStr === jwksUrl) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(url, init);
  };

  const verifier = await createLogtoAdminTokenVerifier({
    issuer,
    audience,
    requiredScope,
    jwksUrl,
  });

  const createToken = (options: {
    scope?: string;
    sub?: string;
    aud?: string;
    iss?: string;
    expiresIn?: string;
    noExp?: boolean;
    customKey?: unknown;
  } = {}) => {
    const jwt = new SignJWT({ scope: options.scope ?? "platform:admin profile:read" })
      .setProtectedHeader({ alg: "RS256", kid: "test-qa-key", typ: "JWT" })
      .setIssuer(options.iss ?? issuer)
      .setAudience(options.aud ?? audience)
      .setSubject(options.sub ?? "qa-admin-actor")
      .setIssuedAt();

    if (!options.noExp) {
      jwt.setExpirationTime(options.expiresIn ?? "5m");
    }

    return jwt.sign(options.customKey ?? privateKey);
  };

  const restore = () => {
    globalThis.fetch = originalFetch;
  };

  return { verifier, createToken, restore };
}

test("Auth Real JWT: Verifier accepts token with platform:admin scope and RS256 signature", async () => {
  const { verifier, createToken, restore } = await setupJwtEnvironment();
  try {
    const validToken = await createToken();
    const actor = await verifier(`Bearer ${validToken}`);
    assert.deepEqual(actor, { subject: "qa-admin-actor" });
  } finally {
    restore();
  }
});

test("Auth Real JWT: Missing or malformed Authorization header returns 401 authentication_required", async () => {
  const { verifier, restore } = await setupJwtEnvironment();
  try {
    await assert.rejects(
      verifier(undefined),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "authentication_required",
    );
    await assert.rejects(
      verifier(""),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "authentication_required",
    );
    await assert.rejects(
      verifier("Basic dXNlcjpwYXNz"),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "authentication_required",
    );
  } finally {
    restore();
  }
});

test("Auth Real JWT: Expired, wrong audience, or wrong issuer returns 401 invalid_access_token", async () => {
  const { verifier, createToken, restore } = await setupJwtEnvironment();
  try {
    const expired = await createToken({ expiresIn: "-1m" });
    await assert.rejects(
      verifier(`Bearer ${expired}`),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "invalid_access_token",
    );

    const wrongAud = await createToken({ aud: "https://wrong-audience.test" });
    await assert.rejects(
      verifier(`Bearer ${wrongAud}`),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "invalid_access_token",
    );

    const wrongIss = await createToken({ iss: "https://wrong-issuer.test" });
    await assert.rejects(
      verifier(`Bearer ${wrongIss}`),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "invalid_access_token",
    );

    const noExp = await createToken({ noExp: true });
    await assert.rejects(
      verifier(`Bearer ${noExp}`),
      (err: unknown) => err instanceof DomainError && err.statusCode === 401 && err.code === "invalid_access_token",
    );
  } finally {
    restore();
  }
});

test("Auth Real JWT: Token missing required scope platform:admin returns 403 insufficient_permissions", async () => {
  const { verifier, createToken, restore } = await setupJwtEnvironment();
  try {
    const lackingScope = await createToken({ scope: "profile:read team:viewer" });
    await assert.rejects(
      verifier(`Bearer ${lackingScope}`),
      (err: unknown) => err instanceof DomainError && err.statusCode === 403 && err.code === "insufficient_permissions",
    );
  } finally {
    restore();
  }
});

test("Auth Real JWT: Integration with Fastify preHandler inject flow", async () => {
  const { verifier, createToken, restore } = await setupJwtEnvironment();
  const db = createTestDatabase();
  const app = createApp({ logger: false, pool: db.pool, verifyAdminToken: verifier });

  try {
    const validToken = await createToken();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/team",
      headers: { authorization: `Bearer ${validToken}` },
    });
    assert.equal(res.statusCode, 200);

    const wrongToken = await createToken({ scope: "read:only" });
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/team",
      headers: { authorization: `Bearer ${wrongToken}` },
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().error, "insufficient_permissions");
  } finally {
    await app.close();
    restore();
  }
});
