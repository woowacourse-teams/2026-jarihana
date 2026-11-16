import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const environment = process.argv[2];
if (environment !== "dev" && environment !== "prod") {
  console.error("Usage: pipe the existing ACCESS_TOKEN_SECRET to derive-token-key.mjs dev|prod");
  process.exit(1);
}

const secret = readFileSync(0);
if (secret.length < 32) {
  console.error("ACCESS_TOKEN_SECRET must be at least 32 bytes");
  process.exit(1);
}

const tokenKey = createHmac("sha256", secret)
  .update(`jarihana-realtime:v1:jarihana-api-${environment}`)
  .digest("base64url");
process.stdout.write(tokenKey);
