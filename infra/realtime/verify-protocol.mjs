// Runs one Spring server against isolated development and production databases.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtime = JSON.parse(await readFile(path.join(root, "contracts/realtime/v1/space-runtime.json"), "utf8"));
const jarName = (await readdir(path.join(root, "realtime/build/libs"))).find((name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
assert.ok(jarName, "Run realtime ./gradlew bootJar before verification");
const evidence = await mkdtemp(path.join(tmpdir(), "jarihana-realtime-protocol-"));
const database = `jarihana-realtime-test-${randomUUID()}`;
const databasePassword = randomUUID();
const environments = Object.fromEntries(["dev", "prod"].map((environment) => [environment, {
  databaseName: `realtime_${environment}_test`,
  reader: `realtime_${environment}_reader`,
  password: randomUUID(),
  tokenKey: randomBytes(32)
}]));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
const room = structuredClone(runtime.defaultRoom);
room.items = [
  { id: "seat", kind: "sofa", x: -2, z: 5.1, rotation: 0 },
  { id: "counter", kind: "cafeCabinet", x: 0, z: 5.8, rotation: 0 },
  { id: "table", kind: "table", x: -4.3, z: 5.5, rotation: 0 }
];
const productionRoom = structuredClone(room);
productionRoom.items[0].x -= 0.25;
const productionRevision = 100;
const avatarColumns = "member_id, version, hair, skin, hair_color, face, eyes, eyebrows, nose, mouth, glasses, outfit, shoes, shoe_color, hat, hat_color, bag, bag_color, handheld";
let revision = 1;
let server;
let browserPreview;
let verifyBrowser;
let databaseStarted = false;
let serverLog = "";
const clients = [];
const receipt = [];

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120000, ...options });
}

function sql(input, databaseName = environments.dev.databaseName) {
  return docker(["exec", "-i", database, "psql", "-X", "-q", "-U", "postgres", "-d", databaseName, "-v", "ON_ERROR_STOP=1"], { input });
}

function saveLayout(groupIds = [1, 2], layout = room, layoutRevision = revision, environment = "dev") {
  const json = JSON.stringify(layout).replaceAll("'", "''");
  sql(`INSERT INTO group_space (group_id, room_json, revision, created_at, updated_at)
    SELECT id, '${json}', ${layoutRevision}, now(), now() FROM groups WHERE id IN (${groupIds.join(", ")})
    ON CONFLICT (group_id) DO UPDATE SET room_json = EXCLUDED.room_json, revision = EXCLUDED.revision, updated_at = now();`,
  environments[environment].databaseName);
}

function seedAvatar(memberId, hair, outfit, environment = "dev") {
  sql(`INSERT INTO member_avatar (${avatarColumns}, created_at, updated_at)
    VALUES (${memberId}, 1, '${hair}', 'warm', 'chestnut', 'round', 'dot', 'straight', 'small', 'smile', 'none',
      '${outfit}', 'sneakers', 'white', 'none', 'ink', 'none', 'ink', 'none', now(), now());`,
  environments[environment].databaseName);
}

async function startDatabase() {
  docker(["run", "--detach", "--rm", "--name", database, "--publish", "127.0.0.1::5432",
    "--env", "POSTGRES_PASSWORD", "postgres:17"],
  { env: { ...process.env, POSTGRES_PASSWORD: databasePassword } });
  databaseStarted = true;
  await waitFor(() => {
    try {
      docker(["exec", database, "pg_isready", "--host", "127.0.0.1", "--quiet"], { stdio: "ignore" });
      return true;
    } catch { return false; }
  }, "PostgreSQL startup", 30000);
  const migrations = path.join(root, "backend/src/main/resources/db/migration");
  const schema = [];
  for (const file of ["V1__baseline.sql", "V39__member_avatar.sql", "V40__group_space.sql"]) {
    schema.push(await readFile(path.join(migrations, file), "utf8"));
  }
  for (const { databaseName, reader, password } of Object.values(environments)) {
    sql(`
      CREATE ROLE ${reader} LOGIN PASSWORD '${password}';
      CREATE DATABASE ${databaseName};
      REVOKE CONNECT ON DATABASE ${databaseName} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${databaseName} TO ${reader};
    `, "postgres");
    for (const migration of schema) {
      sql(`BEGIN;\n${migration}\nCOMMIT;`, databaseName);
    }
    sql(`
      GRANT USAGE ON SCHEMA public TO ${reader};
      GRANT SELECT (id, status, type) ON groups TO ${reader};
      GRANT SELECT (id, crew_name, withdrawn_at) ON member TO ${reader};
      GRANT SELECT (group_id, member_id, role) ON group_member TO ${reader};
      GRANT SELECT (group_id, room_json, revision) ON group_space TO ${reader};
      GRANT SELECT (${avatarColumns}) ON member_avatar TO ${reader};
    `, databaseName);
  }
  sql(`
    INSERT INTO groups (id, created_at, updated_at, introduction, name, status, type, meeting_type) VALUES
      (1, now(), now(), 'Fixture', 'Fixture room A', 'ACTIVE', 'CLUB', 'OFFLINE'),
      (2, now(), now(), 'Fixture', 'Fixture room B', 'ACTIVE', 'STUDY', 'OFFLINE'),
      (3, now(), now(), 'Fixture', 'Ended room', 'ENDED', 'CLUB', 'OFFLINE'),
      (4, now(), now(), 'Fixture', 'Session group', 'ACTIVE', 'SESSION', 'OFFLINE'),
      (10, now(), now(), 'Fixture', 'Browser room', 'ACTIVE', 'CLUB', 'OFFLINE');
    INSERT INTO member (id, created_at, updated_at, crew_name, github_id, member_type)
      SELECT id, now(), now(), id::text, 'fixture-' || id, 'COACH' FROM unnest(ARRAY[1, 2, 101, 102, 103, 201]) AS ids(id);
    INSERT INTO group_member (created_at, updated_at, joined_at, role, group_id, member_id) VALUES
      (now(), now(), now(), 'LEADER', 1, 101), (now(), now(), now(), 'MEMBER', 1, 102),
      (now(), now(), now(), 'LEADER', 2, 201), (now(), now(), now(), 'LEADER', 10, 1);
  `);
  sql(`
    INSERT INTO groups (id, created_at, updated_at, introduction, name, status, type, meeting_type) VALUES
      (1, now(), now(), 'Fixture', 'Production room A', 'ACTIVE', 'CLUB', 'OFFLINE');
    INSERT INTO member (id, created_at, updated_at, crew_name, github_id, member_type)
      SELECT id, now(), now(), 'P' || id, 'fixture-prod-' || id, 'COACH' FROM unnest(ARRAY[101, 102]) AS ids(id);
    INSERT INTO group_member (created_at, updated_at, joined_at, role, group_id, member_id) VALUES
      (now(), now(), now(), 'LEADER', 1, 101), (now(), now(), now(), 'MEMBER', 1, 102);
  `, environments.prod.databaseName);
  seedAvatar(101, "curly", "mint");
  seedAvatar(102, "bob", "coral");
  seedAvatar(101, "parted", "navy", "prod");
  seedAvatar(1, "curly", "mint");
  seedAvatar(2, "bob", "coral");
  saveLayout();
  saveLayout([1], productionRoom, productionRevision, "prod");
  const dbPort = docker(["port", database, "5432/tcp"]).trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert.ok(dbPort, "PostgreSQL fixture must bind to a dynamic loopback port");
  return dbPort;
}

function startServer(dbPort) {
  const environmentSettings = {};
  for (const [environment, { databaseName, reader, password, tokenKey }] of Object.entries(environments)) {
    const prefix = `REALTIME_${environment.toUpperCase()}`;
    environmentSettings[`${prefix}_TOKEN_KEY`] = tokenKey.toString("base64url");
    environmentSettings[`${prefix}_DB_JDBC_URL`] = `jdbc:postgresql://127.0.0.1:${dbPort}/${databaseName}`;
    environmentSettings[`${prefix}_DB_USERNAME`] = reader;
    environmentSettings[`${prefix}_DB_PASSWORD`] = password;
  }
  const allowedOrigins = ["http://localhost:5193", "http://127.0.0.1:5193"];
  if (browserPreview) allowedOrigins.push(browserPreview.originUrl);
  const child = spawn(java, ["-jar", path.join(root, "realtime/build/libs", jarName),
    "--server.port=0", "--realtime.refresh-interval-ms=200", "--realtime.reconnect-grace-ms=3000",
    `--realtime.allowed-origins=${allowedOrigins.join(",")}`], {
    cwd: root,
    env: { ...process.env, ...environmentSettings, REALTIME_ENABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (data) => { serverLog += data; });
  child.stderr.on("data", (data) => { serverLog += data; });
  child.on("error", (error) => { serverLog += `${error}\n`; });
  return child;
}

function token(memberId, roomId = "1", { environment = "dev", signingEnvironment = environment, jti = randomUUID() } = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: `jarihana-api-${environment}`, aud: "jarihana-realtime", sub: memberId, roomId, jti, iat: now, exp: now + 60 })}`;
  const { tokenKey } = environments[signingEnvironment];
  return `${input}.${createHmac("sha256", tokenKey).update(input).digest("base64url")}`;
}

async function waitFor(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out: ${label}`);
}

async function connect(url, memberId, roomId = "1", options = {}) {
  const socket = new WebSocket(url);
  const client = { socket, messages: [], state: null, closed: false };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    client.messages.push(message);
    if (["ROOM_SNAPSHOT", "ROOM_STATE"].includes(message.type)) client.state = message;
  };
  socket.onclose = ({ code, reason }) => { client.closed = true; client.close = { code, reason }; };
  socket.onerror = () => { client.closed = true; };
  clients.push(client);
  await waitFor(() => socket.readyState === WebSocket.OPEN || client.closed, "socket open");
  assert.equal(client.closed, false);
  socket.send(JSON.stringify({ type: "AUTH_JOIN", protocolVersion: 1, token: token(memberId, roomId, options) }));
  if (options.expectedError) {
    await waitFor(() => client.close || client.state, "access denied closes connection");
    assert.deepEqual(client.close, { code: 4001, reason: options.expectedError });
    return client;
  }
  await waitFor(() => client.state || client.closed || client.messages.find((message) => message.type === "ERROR"), "initial snapshot");
  assert.ok(client.state, JSON.stringify({ close: client.close, messages: client.messages }));
  return client;
}

function context(client) {
  return { roomEpoch: client.state.roomEpoch, connectionGeneration: client.state.connectionGeneration, layoutRevision: client.state.layoutRevision };
}

function participant(client, memberId) {
  return client.state.participants.find((entry) => entry.memberId === memberId);
}

async function command(client, payload, extra = {}) {
  const commandId = extra.commandId ?? randomUUID();
  const start = client.messages.length;
  client.socket.send(JSON.stringify({ type: "COMMAND", ...context(client), commandId, payload, ...extra }));
  return waitFor(() => client.messages.slice(start).find((message) => message.type === "COMMAND_RESULT" && message.commandId === commandId)
    || client.messages.slice(start).find((message) => message.type === "ERROR"), `command ${payload.action}`);
}

try {
  if (process.argv.includes("--browser")) {
    const browser = await import("./verify-browser.mjs");
    browserPreview = await browser.startBrowserPreview(root);
    verifyBrowser = browser.verifyBrowser;
  }
  server = startServer(await startDatabase());
  const port = await waitFor(() => {
    if (!server.pid || server.exitCode !== null) throw new Error(`Server exited: ${serverLog.slice(-8000)}`);
    return serverLog.match(/Tomcat started on port (\d+)/)?.[1];
  }, "Spring startup", 45000);
  const healthUrl = `http://127.0.0.1:${port}/actuator/health`;
  const checkHealth = () => fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  const health = await checkHealth();
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "UP");
  for (const { reader, databaseName } of Object.values(environments)) {
    sql(`REVOKE SELECT (hair) ON member_avatar FROM ${reader};`, databaseName);
    const missingGrant = await checkHealth();
    assert.equal(missingGrant.status, 503);
    assert.equal((await missingGrant.json()).status, "DOWN");
    sql(`GRANT SELECT (hair) ON member_avatar TO ${reader};`, databaseName);
    assert.equal((await checkHealth()).status, 200);
  }
  receipt.push("health depends on SELECT grants in both databases");

  const url = `ws://127.0.0.1:${port}/ws/realtime`;
  await connect(url, "101", "3", { expectedError: "ACCESS_DENIED" });
  await connect(url, "101", "4", { expectedError: "ACCESS_DENIED" });
  await connect(url, "999", "1", { expectedError: "ACCESS_DENIED" });
  receipt.push("ended and session groups and missing members are rejected");
  await connect(url, "101", "1", { environment: "prod", signingEnvironment: "dev", expectedError: "INVALID_TOKEN" });
  await connect(url, "101", "1", { signingEnvironment: "prod", expectedError: "INVALID_TOKEN" });
  receipt.push("each issuer requires its own signing key");

  const jti = randomUUID();
  const [a, productionA] = await Promise.all([
    connect(url, "101", "1", { jti }),
    connect(url, "101", "1", { environment: "prod", jti })
  ]);
  await connect(url, "101", "1", { jti, expectedError: "TOKEN_REPLAYED" });
  assert.equal(a.state.roomId, productionA.state.roomId);
  assert.equal(a.state.selfId, productionA.state.selfId);
  assert.notEqual(a.state.roomEpoch, productionA.state.roomEpoch);
  assert.equal(a.state.layoutRevision, revision);
  assert.equal(productionA.state.layoutRevision, productionRevision);
  assert.equal(a.state.participants[0].displayName, "101");
  assert.equal(productionA.state.participants[0].displayName, "P101");
  receipt.push("same group ID, member ID and token ID resolve to isolated databases and rooms");

  const b = await connect(url, "102");
  const productionB = await connect(url, "102", "1", { environment: "prod" });
  const other = await connect(url, "201", "2");
  await waitFor(() => a.state.participants.length === 2, "two participants");
  assert.equal(other.state.participants.length, 1);
  receipt.push("join snapshots and room isolation");
  assert.deepEqual(participant(b, "101").avatarAppearance, {
    version: 1, hair: "curly", skin: "warm", hairColor: "chestnut", face: "round", eyes: "dot",
    eyebrows: "straight", nose: "small", mouth: "smile", glasses: "none", outfit: "mint", shoes: "sneakers",
    shoeColor: "white", hat: "none", hatColor: "ink", bag: "none", bagColor: "ink", handheld: "none"
  });
  assert.equal(participant(a, "102").avatarAppearance.outfit, "coral");
  assert.equal(participant(productionB, "101").avatarAppearance.outfit, "navy");
  assert.equal(participant(productionB, "102").avatarAppearance, null);
  const avatarControlSeq = b.state.controlSeq;
  sql("UPDATE member_avatar SET outfit = 'ochre', updated_at = now() WHERE member_id = 101;");
  await waitFor(() => participant(b, "101").avatarAppearance.outfit === "ochre", "avatar changes on refresh");
  assert.ok(b.state.controlSeq > avatarControlSeq);
  assert.equal(b.state.layoutRevision, revision);
  assert.equal(participant(productionB, "101").avatarAppearance.outfit, "navy");
  receipt.push("participant avatars come from the verified environment and update without movement or layout changes");

  assert.equal((await command(a, { action: "SIT", assetId: "seat", slot: 1 })).success, true);
  assert.equal((await command(productionA, { action: "SIT", assetId: "seat", slot: 1 })).success, true);
  const devSeat = await waitFor(() => a.state.participants.find((participant) => participant.memberId === "101")?.seat, "development seat");
  const prodSeat = await waitFor(() => productionA.state.participants.find((participant) => participant.memberId === "101")?.seat, "production seat");
  assert.ok(Math.abs(devSeat.position.x - prodSeat.position.x - 0.25) < 0.0001);
  const conflict = await command(b, { action: "SIT", assetId: "seat", slot: 1 });
  assert.equal(conflict.success, false);
  const c = await connect(url, "103");
  assert.equal(c.state.participants.find((participant) => participant.memberId === "101").seat.assetId, "seat");
  assert.equal(c.state.participants.find((participant) => participant.memberId === "103").displayName, "103");
  assert.equal(participant(c, "101").avatarAppearance.outfit, "ochre");
  assert.equal(participant(c, "103").avatarAppearance, null);
  assert.deepEqual(productionA.state.participants.map(({ memberId }) => memberId).sort(), ["101", "102"]);
  receipt.push("one seat owner and late-joining guest receives the seated snapshot");
  receipt.push("both environments can occupy the same seat independently and do not share participants");

  room.items = room.items.map((asset) => asset.id === "seat" ? { ...asset, x: -6 } : asset);
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "layout reconciliation");
  assert.equal(a.state.participants.find((participant) => participant.memberId === "101").seat, null);
  const stale = await command(b, { action: "SIT", assetId: "seat", slot: 1 }, { layoutRevision: revision - 1 });
  assert.equal(stale.success === true, false);
  receipt.push("moved seat releases occupant and stale layout command rejected");
  assert.equal(productionA.state.layoutRevision, productionRevision);
  assert.deepEqual(productionA.state.participants.find((participant) => participant.memberId === "101").seat, prodSeat);
  productionRoom.items[0].x += 0.5;
  saveLayout([1], productionRoom, productionRevision + 1, "prod");
  await waitFor(() => productionB.state.layoutRevision === productionRevision + 1, "production layout reconciliation");
  assert.equal(productionB.state.participants.find((participant) => participant.memberId === "101").seat, null);
  assert.equal(b.state.layoutRevision, revision);
  receipt.push("layout refresh is scoped to the database of each active room");

  await command(a, { action: "OPEN", assetId: "counter" });
  const takeId = randomUUID();
  const taken = await command(a, { action: "TAKE", assetId: "counter", kind: "cookie" }, { commandId: takeId });
  assert.equal(taken.success, true, JSON.stringify(taken));
  const self = () => a.state.participants.find((participant) => participant.memberId === "101");
  await waitFor(() => self().heldItemId, "held cookie");
  const itemId = self().heldItemId;
  const before = a.state.items.length;
  assert.equal((await command(a, { action: "TAKE", assetId: "counter", kind: "cookie" }, { commandId: takeId })).success, true);
  assert.equal(a.state.items.length, before);
  assert.equal((await command(b, { action: "PICKUP", itemId })).success, false);
  receipt.push("item identity, single owner and idempotent take");

  room.items = room.items.filter((asset) => asset.id !== "counter");
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "source removal");
  assert.equal(self().heldItemId, itemId);
  assert.equal((await command(a, { action: "THROW", itemId, velocity: { x: 0, y: 3, z: 2 } })).success, true);
  await waitFor(() => a.state.items.some((item) => item.id === itemId && item.location === "WORLD"), "throw landing");
  assert.equal(self().heldItemId, null);
  receipt.push("source deletion preserves held item and throw settles in world");

  room.items.push({ id: "counter", kind: "cafeCabinet", x: 0, z: 5.8, rotation: 0 });
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "restored producer");
  assert.equal((await command(a, { action: "OPEN", assetId: "counter" })).success, true);
  assert.equal((await command(a, { action: "TAKE", assetId: "counter", kind: "cup" })).success, true);
  await waitFor(() => self().heldItemId, "held cup");
  const cupId = self().heldItemId;
  assert.equal((await command(a, { action: "PRODUCE", assetId: "counter", kind: "coffee", itemId: cupId })).success, true);
  await waitFor(() => a.state.assets.counter?.production, "production starts");
  const finishesAt = a.state.assets.counter.production.completesAt;
  room.items = room.items.map((asset) => asset.id === "counter" ? { ...asset, x: 0.5 } : asset);
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "producer moved");
  assert.equal(a.state.assets.counter?.production ?? null, null);
  await waitFor(() => Date.now() > finishesAt + 250, "old production deadline");
  assert.equal(a.state.items.find((item) => item.id === cupId)?.kind, "cup");
  receipt.push("moving a producer cancels work and preserves the cup past the old deadline");

  assert.equal((await command(a, { action: "PICKUP", itemId: cupId })).success, true);
  assert.equal((await command(a, { action: "PLACE", assetId: "table", slot: 0, itemId: cupId })).success, true);
  await waitFor(() => a.state.items.find((item) => item.id === cupId)?.assetId === "table", "cup on surface");
  const surfaceX = a.state.items.find((item) => item.id === cupId).position.x;
  room.items = room.items.map((asset) => asset.id === "table" ? { ...asset, x: asset.x - 0.5 } : asset);
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "surface moved");
  assert.ok(Math.abs(a.state.items.find((item) => item.id === cupId).position.x - surfaceX + 0.5) < 0.0001);
  room.items = room.items.filter((asset) => asset.id !== "table");
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "surface removed");
  assert.equal(a.state.items.find((item) => item.id === cupId)?.location, "WORLD");
  receipt.push("surface attachment follows furniture and becomes a world item after removal");

  const replacement = await connect(url, "101");
  await waitFor(() => a.closed, "old connection replacement");
  await waitFor(() => replacement.state.participants.filter((participant) => participant.memberId === "101").length === 1, "replacement identity");
  assert.notEqual(replacement.state.connectionGeneration, a.state.connectionGeneration);
  assert.equal(participant(replacement, "101").avatarAppearance.outfit, "ochre");
  receipt.push("replacement connection survives old close without duplicate avatar");

  sql("UPDATE member SET withdrawn_at = now() WHERE id = 102;");
  await waitFor(() => b.closed, "revoked access closes connection");
  assert.equal(productionB.closed, false);
  assert.equal((await command(productionB, { action: "OPEN", assetId: "counter" })).success, true);
  receipt.push("account withdrawal closes the matching connection only in that environment");
  assert.equal((await command(replacement, { action: "OPEN", assetId: "counter" })).success, true);
  assert.equal((await command(replacement, { action: "TAKE", assetId: "counter", kind: "cookie" })).success, true);
  await waitFor(() => replacement.state.participants.find((actor) => actor.memberId === "101")?.heldItemId, "held item before leaving");
  const leftItemId = replacement.state.participants.find((actor) => actor.memberId === "101").heldItemId;
  replacement.socket.close(1000, "LEAVE");
  await waitFor(() => !c.state.participants.some((actor) => actor.memberId === "101"), "intentional leave", 1500);
  assert.equal(c.state.items.find((item) => item.id === leftItemId)?.location, "WORLD");
  receipt.push("intentional leave immediately removes the participant and drops the held item");
  if (browserPreview) {
    Object.assign(room, structuredClone(runtime.defaultRoom), {
      items: [{ id: "camera", kind: "cameraCabinet", x: -5, z: 6.5, rotation: 0 }]
    });
    revision += 1;
    saveLayout([10]);
    receipt.push(...await verifyBrowser({ root, originUrl: browserPreview.originUrl, url, token, room, revision: () => revision, evidence }));
  }
  await writeFile(path.join(evidence, "receipt.json"), JSON.stringify({ passed: receipt, recordedAt: new Date().toISOString() }, null, 2));
  process.stdout.write(JSON.stringify({ passed: receipt, evidence }, null, 2) + "\n");
} catch (error) {
  await writeFile(path.join(evidence, "failure.json"), JSON.stringify({ message: error.message, passed: receipt,
    clients: clients.map((client) => ({ close: client.close, messages: client.messages.slice(-8) })) }, null, 2));
  process.stderr.write(`${error.stack}\nEvidence: ${evidence}\n`);
  process.exitCode = 1;
} finally {
  await browserPreview?.close();
  for (const client of clients) client.socket.close();
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolve) => {
      const timer = setTimeout(() => { server.kill("SIGKILL"); }, 12000);
      server.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    server.kill("SIGTERM");
    await stopped;
  }
  await writeFile(path.join(evidence, "server.log"), serverLog);
  if (databaseStarted) docker(["rm", "-f", database]);
}
