import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import fs from 'node:fs';
const [dir, issuer, audience, jwksPath] = process.argv.slice(2);
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'e2e-key', alg: 'RS256', use: 'sig' };
fs.writeFileSync(jwksPath, JSON.stringify({ keys: [jwk] }));
const sign = async (scope) => {
  const payload = scope ? { scope } : {};
  return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'e2e-key' })
    .setIssuer(issuer).setAudience(audience).setSubject('e2e-admin')
    .setIssuedAt().setExpirationTime('30m').sign(privateKey);
};
fs.writeFileSync(`${dir}/token.txt`, await sign('platform:admin'));
fs.writeFileSync(`${dir}/token_noscope.txt`, await sign(null));
console.log('keys+token written');
