import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { green, history, localSecret, request, socket, until, user } from "./verify.mjs";

const jar = process.env.CHAT_TEST_JAR;
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
assert.ok(jar && path.isAbsolute(jar), "CHAT_TEST_JAR must be an immutable absolute jar path");
const directory = await mkdtemp(path.join(tmpdir(), "jarihana-chat-continuity-"));
const account = user(901001);
const temporaryServer = "http://127.0.0.1:8097";
const sockets = [];
let processHandle;
let proxy;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (query) => docker("exec", "jarihana-postgres", "psql", "-U", "jarihana", "-d", "jarihana_chat_realtime", "-tAc", query);

async function start() {
  processHandle = spawn(java, ["-Xmx384m", "-jar", jar, "--spring.profiles.active=local", "--server.port=8097", "--spring.jpa.show-sql=false"], {
    env: { ...process.env, DB_URL: "jdbc:postgresql://127.0.0.1:5432/jarihana_chat_realtime", DB_USERNAME: "jarihana", DB_PASSWORD: "jarihana", ACCESS_TOKEN_SECRET: localSecret,
      GITHUB_OAUTH_CLIENT_ID: "local-chat-fixture", GITHUB_OAUTH_CLIENT_SECRET: "local-chat-fixture", AWS_EC2_METADATA_DISABLED: "true",
      FRONTEND_ORIGIN: "http://127.0.0.1:5176", CHAT_ALLOWED_ORIGINS: "http://127.0.0.1:5176,http://127.0.0.1:5177", CHAT_LISTENER_APPLICATION_NAME: "jarihana-chat-continuity",
      PUSH_ENABLED: "false", PUSH_WORKER_ENABLED: "false", SENTRY_BACKEND_DSN: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const log = createWriteStream(path.join(directory, "server.log"), { flags: "a" });
  processHandle.stdout.pipe(log);
  processHandle.stderr.pipe(log);
  await until(async () => {
    assert.equal(processHandle.exitCode, null, `Temporary server exited; inspect ${directory}/server.log`);
    try { return (await request(account, temporaryServer, "/chats")).status === 200; } catch { return false; }
  }, "temporary backend ready", 60000);
}

async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  processHandle.kill("SIGTERM");
  await until(() => processHandle.exitCode !== null || processHandle.signalCode !== null, "owned backend graceful shutdown", 45000);
}

const config = (color) => execFileSync("python3", ["-c", "import importlib.util,sys; s=importlib.util.spec_from_file_location('d','infra/scripts/deploy-bluegreen.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.nginx_config(sys.argv[1]))", color], { encoding: "utf8" })
  .replace("http://127.0.0.1:18080", "http://host.docker.internal:8097")
  .replace("http://127.0.0.1:28080", "http://host.docker.internal:8096");

try {
  await start();
  const listener = await socket(account, temporaryServer); sockets.push(listener);
  await delay(200);
  const startIndex = listener.events.length;
  assert.equal(sql("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'jarihana-chat-continuity'"), "1");
  assert.equal(sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'jarihana-chat-continuity'"), "t");
  const missed = await request(account, green, "/groups/902003/chat/messages", "POST", { clientMessageId: randomUUID(), content: "LISTEN 단절 중 저장" });
  assert.equal(missed.status, 201);
  await until(() => listener.events.slice(startIndex).some((e) => e.value.type === "RESYNC_REQUIRED"), "listener reconnect signals resync");
  assert.ok((await history(account, temporaryServer, "902003", String(BigInt(missed.data.sequence) - 1n))).some((m) => m.id === missed.data.id));
  listener.ws.close();
  console.log("PASS LISTEN connection termination, reconnect signal, durable REST recovery");

  await writeFile(path.join(directory, "nginx.conf"), config("blue"));
  proxy = docker("run", "-d", "--rm", "-p", "127.0.0.1::8080", "-v", `${directory}:/etc/nginx:ro`, "nginx:1.30.5-alpine");
  const port = Number(docker("port", proxy, "8080/tcp").split(":").at(-1));
  const base = `http://127.0.0.1:${port}`;
  async function waitColor(color) {
    await until(async () => {
      try { const response = await fetch(`${base}/api/groups`, { signal: AbortSignal.timeout(2000) }); return response.ok && response.headers.get("X-Jarihana-Color") === color; } catch { return false; }
    }, `proxy ${color} ready`, 15000);
  }
  await waitColor("blue");
  const initial = await request(account, base, "/groups/902004/chat/messages");
  assert.equal(initial.status, 200);
  const cursor = initial.data.latestSequence;
  const oldSocket = await socket(account, base); sockets.push(oldSocket);
  let closeCode;
  oldSocket.ws.on("close", (code) => { closeCode = code; });
  await delay(200);
  const sent = [];
  let newSocket;
  for (let i = 0; i < 100; i++) {
    if (i === 25) {
      await writeFile(path.join(directory, "nginx.conf"), config("green"));
      docker("exec", proxy, "nginx", "-t");
      docker("exec", proxy, "nginx", "-s", "reload");
      await waitColor("green");
      assert.ok(!oldSocket.closed, "Existing blue socket remains during drain");
      newSocket = await socket(account, base); sockets.push(newSocket);
      await delay(200);
    }
    if (i === 50) {
      await until(() => oldSocket.events.some((e) => e.value.message?.id === sent.at(-1).id), "old blue socket still receives green writes");
      await stop();
      await until(() => oldSocket.closed, "old socket closes for reconnect");
      assert.equal(closeCode, 1001);
    }
    const saved = await request(account, base, "/groups/902004/chat/messages", "POST", { clientMessageId: randomUUID(), content: `전환 검증 ${i}` });
    assert.equal(saved.status, 201, JSON.stringify(saved));
    sent.push(saved.data);
    await delay(20);
  }
  await until(() => newSocket.events.some((e) => e.value.message?.id === sent.at(-1).id), "new green socket receives final message");
  const recovered = await history(account, base, "902004", cursor);
  const merged = new Map([...oldSocket.events, ...newSocket.events].filter((e) => e.value.message).map((e) => [e.value.message.id, e.value.message]));
  for (const message of recovered) merged.set(message.id, message);
  for (const saved of sent) assert.ok(merged.has(saved.id));
  assert.equal(recovered.filter((m) => sent.some((s) => s.id === m.id)).length, 100);
  for (let i = 1; i < sent.length; i++) assert.equal(BigInt(sent[i].sequence), BigInt(sent[i - 1].sequence) + 1n);
  console.log("PASS real nginx blue/green switch: 100 messages, old/new sockets, graceful1001, REST merge no missing/duplicates");

  await start();
  const persisted = await history(account, temporaryServer, "902004", cursor);
  assert.ok(sent.every((m) => persisted.some((p) => p.id === m.id)));
  console.log("PASS backend restart retains all 100 messages");
  console.log(`Evidence directory: ${directory}`);
} finally {
  for (const state of sockets) state.ws.close();
  if (proxy) docker("rm", "-f", proxy);
  await stop();
}
