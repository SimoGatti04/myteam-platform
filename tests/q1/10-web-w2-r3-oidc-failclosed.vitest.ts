import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * QA Q2-C — Regressione indipendente su OIDC discovery fail-closed (QA-B-F1).
 *
 * W2-R3 ha rimosso il fallback hardcoded a `/oidc/auth` e `/oidc/token`. Questi test
 * verificano il comportamento dei CHIAMANTI (`buildAuthorizationUrl`,
 * `handleAuthorizationCallback`): la suite Web copriva solo `fetchDiscovery`.
 * Nessun accesso di rete reale: `fetch` è sostituito.
 */

const config = {
  endpoint: "https://auth.myteam.local/oidc",
  appId: "myteam-web-app-client-id",
  apiResource: "https://api.myteam.local",
  scopes: "openid profile offline_access platform:admin",
  redirectUri: "https://myteam.local/callback",
  postLogoutRedirectUri: "https://myteam.local",
};

type OidcClientCtor = new (config: typeof config) => any;
let OidcClient: OidcClientCtor;
let fetchMock: ReturnType<typeof vi.fn>;

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function discoveryFor(issuer: string, auth: string, token: string) {
  return { issuer, authorization_endpoint: auth, token_endpoint: token };
}

beforeAll(async () => {
  const mod = await import("../../apps/web/src/services/oidc");
  OidcClient = mod.OidcClient as unknown as OidcClientCtor;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("QA Q2-C — discovery fail-closed nei chiamanti", () => {
  it("X1: HTTP 500 sulla discovery interrompe il login senza costruire alcun URL di autorizzazione", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const client = new OidcClient(config);

    await expect(client.buildAuthorizationUrl({ returnTo: "partite" })).rejects.toThrow(/HTTP 500/);

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.every((u) => u.includes(".well-known/openid-configuration"))).toBe(true);
    expect(calledUrls).not.toContain(`${config.endpoint}/auth`);
  });

  it("X2: discovery irraggiungibile (offline) interrompe il login con errore esplicito", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const client = new OidcClient(config);

    await expect(client.buildAuthorizationUrl()).rejects.toThrow(/non raggiungibile/);
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls).not.toContain(`${config.endpoint}/auth`);
    expect(calledUrls.every((u) => u.includes(".well-known/openid-configuration"))).toBe(true);
  });

  it("X3: issuer difforme interrompe il login e non produce URL", async () => {
    fetchMock.mockResolvedValue(
      okJson(discoveryFor("https://malicious-gateway.io/oidc", "https://malicious-gateway.io/oidc/auth", "https://malicious-gateway.io/oidc/token")),
    );
    const client = new OidcClient(config);

    await expect(client.buildAuthorizationUrl()).rejects.toThrow(/issuer restituito dal provider/);
  });

  it("X4: se la discovery fallisce, handleAuthorizationCallback non effettua POST al token endpoint", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const client = new OidcClient(config);

    const state = "qa-state-123";
    sessionStorage.setItem(
      "myteam_oidc_pkce",
      JSON.stringify({ codeVerifier: "v".repeat(43), state, nonce: "n".repeat(16), createdAt: Date.now() }),
    );

    await expect(
      client.handleAuthorizationCallback(`https://myteam.local/callback?code=auth-code&state=${state}`),
    ).rejects.toThrow(/HTTP 500/);

    const posts = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(posts.length).toBe(0);
  });

  it("X5: gli endpoint usati provengono dalla discovery, non da concatenazione", async () => {
    const discoveredAuth = "https://idp.example/oauth2/v3/authorize";
    fetchMock.mockResolvedValue(okJson(discoveryFor(config.endpoint, discoveredAuth, "https://idp.example/oauth2/v3/token")));
    const client = new OidcClient(config);

    const { url } = await client.buildAuthorizationUrl({ returnTo: "partite" });
    expect(url.startsWith(discoveredAuth)).toBe(true);
    expect(url).not.toContain("/oidc/auth");
  });

  it("X6: una discovery valida resta utilizzabile (controllo positivo)", async () => {
    fetchMock.mockResolvedValue(okJson(discoveryFor(config.endpoint, `${config.endpoint}/auth`, `${config.endpoint}/token`)));
    const client = new OidcClient(config);

    const { url } = await client.buildAuthorizationUrl();
    expect(url.startsWith(`${config.endpoint}/auth`)).toBe(true);
    expect(new URL(url).searchParams.get("code_challenge_method")).toBe("S256");
  });
});
