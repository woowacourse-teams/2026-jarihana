import { createECDH, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const javaHome = process.env.JAVA_HOME;
if (!javaHome) throw new Error("Set JAVA_HOME to a Java 21 installation.");
if (process.argv.slice(2).some((argument) => argument !== "--real-provider")) throw new Error("Only --real-provider is supported.");
const realProvider = process.argv.includes("--real-provider");
const container = `jarihana-push-test-${randomUUID().slice(0, 8)}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jarihana-push-test-"));
const runtimePath = path.join(process.execPath, "..");
const environment = { ...process.env, PATH: `${runtimePath}${path.delimiter}${process.env.PATH}` };
let backend;
let backendError;
let backendLog;
let created = false;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
function token(id, secret) {
  const now = Math.floor(Date.now() / 1000);
  const value = Buffer.from(JSON.stringify({ alg: "HS512", typ: "JWT" })).toString("base64url") + "."
    + Buffer.from(JSON.stringify({ sub: String(id), iat: now, exp: now + 7200 })).toString("base64url");
  return `${value}.${createHmac("sha512", secret).update(value).digest("base64url")}`;
}
async function cleanup() {
  if (backend?.pid && backend.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => { backend.kill("SIGKILL"); resolve(); }, 5000);
      backend.once("exit", () => { clearTimeout(timer); resolve(); }); backend.kill("SIGTERM");
    });
  }
  if (backendLog !== undefined) { fs.closeSync(backendLog); backendLog = undefined; }
  if (created) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  fs.rmSync(temporary, { recursive: true, force: true });
}
process.once("SIGINT", () => { void cleanup().then(() => process.exit(130)); });
process.once("SIGTERM", () => { void cleanup().then(() => process.exit(143)); });
try {
  for (const port of [55436, 8086, 4176]) await freePort(port);
  process.stdout.write("Building backend; existing local databases and credentials are not used.\n");
  run("./gradlew", ["bootJar", "--console=plain"], { cwd: path.join(root, "backend") });
  run("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1:55436:5432",
    "--env", "POSTGRES_DB=jarihana_push_test", "--env", "POSTGRES_USER=push_test",
    "--env", "POSTGRES_PASSWORD=push-test-local-only", "postgres:17"], { stdio: "ignore" });
  created = true;
  const key = createECDH("prime256v1"); key.generateKeys();
  const secret = randomBytes(32).toString("hex");
  const libs = path.join(root, "backend/build/libs");
  const jar = fs.readdirSync(libs).find((name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
  backendLog = fs.openSync(path.join(temporary, "backend.log"), "w", 0o600);
  backend = spawn(path.join(javaHome, "bin/java"), ["-jar", path.join(libs, jar), "--server.port=8086",
    "--server.address=127.0.0.1", "--spring.jpa.show-sql=false"], {
    cwd: path.join(root, "backend"), stdio: ["ignore", backendLog, backendLog],
    env: { ...environment, SPRING_PROFILES_ACTIVE: "local", DB_URL: "jdbc:postgresql://127.0.0.1:55436/jarihana_push_test",
      DB_USERNAME: "push_test", DB_PASSWORD: "push-test-local-only", ACCESS_TOKEN_SECRET: secret,
      FRONTEND_ORIGIN: "http://127.0.0.1:4176", PUSH_ENABLED: "true", PUSH_WORKER_ENABLED: realProvider ? "true" : "false",
      PUSH_VAPID_PUBLIC_KEY: key.getPublicKey().toString("base64url"), PUSH_VAPID_PRIVATE_KEY: key.getPrivateKey().toString("base64url"),
      PUSH_VAPID_SUBJECT: "mailto:local-push@example.test", GITHUB_OAUTH_CLIENT_ID: "local-test",
      GITHUB_OAUTH_CLIENT_SECRET: "local-test", GITHUB_OAUTH_REDIRECT_URI: "http://127.0.0.1:8086/api/oauth/github/callback" }
  });
  backend.once("error", (error) => { backendError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (backendError || backend.exitCode !== null) throw new Error("Local backend stopped before readiness.");
    try { ready = (await fetch("http://127.0.0.1:8086/api/groups", { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Wait for local startup. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Local backend did not become ready.");
  const sql = "INSERT INTO member (crew_name,generation,member_type,github_id,course,created_at,updated_at) VALUES "
    + "('모임장',8,'CREW','local-push-leader','BACKEND',now(),now()),('신청자',8,'CREW','local-push-applicant','FRONTEND',now(),now());";
  run("docker", ["exec", "-i", container, "psql", "-U", "push_test", "-d", "jarihana_push_test", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "inherit"] });
  const credentials = path.join(temporary, "credentials.json");
  fs.writeFileSync(credentials, JSON.stringify({ leader: token(1, secret), applicant: token(2, secret) }), { mode: 0o600 });
  process.stdout.write(`Running real-backend browser tests; external provider test ${realProvider ? "enabled" : "disabled"}.\n`);
  run("npm", ["run", "test:e2e", "--", "--config", "playwright.integration.config.js"], {
    cwd: path.join(root, "frontend"), env: { ...environment, WEB_PUSH_TEST_CREDENTIALS: credentials, WEB_PUSH_REAL_PROVIDER: realProvider ? "1" : "0" }
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
} finally { await cleanup(); }
