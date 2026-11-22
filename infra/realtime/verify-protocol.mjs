// Runs one Spring server against isolated development and production databases.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const previousJar = process.env.REALTIME_PREVIOUS_JAR;
const jarName = (await readdir(path.join(root, "realtime/build/libs"))).find((name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
assert.ok(jarName, "Run realtime ./gradlew bootJar before verification");
const evidence = await mkdtemp(path.join(tmpdir(), "jarihana-realtime-protocol-"));
// Preflight processes and the live JVM must test the same artifact throughout a local rebuild.
const candidateJar = path.join(evidence, jarName);
await copyFile(path.join(root, "realtime/build/libs", jarName), candidateJar);
const fixtureId = `jarihana-realtime-test-${randomUUID()}`;
const databasePassword = randomUUID();
const environments = Object.fromEntries(["dev", "prod"].map((environment) => [environment, {
  container: fixtureId + "-" + environment,
  databaseName: `realtime_${environment}_test`,
  reader: `realtime_${environment}_reader`,
  password: randomUUID(),
  tokenKey: randomBytes(32)
}]));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
const room = { version: 11, template: "lounge", name: "Saved room", theme: "blue" };
room.items = [
  { id: "seat", kind: "sofa", x: -2, z: 5.1, rotation: 0, level: 0, scaleY: 1.15, color: "#536bd6", title: "오래된 소파" },
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
const startedDatabases = [];
let previousServer;
let serverLog = "";
const clients = [];
const receipt = [];

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120000, ...options });
}

function sql(input, databaseName = environments.dev.databaseName, owner) {
  const database = owner ?? Object.values(environments).find(candidate => candidate.databaseName === databaseName);
  assert.ok(database, "A PostgreSQL fixture must be selected");
  return docker(["exec", "-i", database.container, "psql", "-X", "-qAt", "-U", "postgres", "-d", databaseName, "-v", "ON_ERROR_STOP=1"], { input });
}

function saveLayout(groupIds = [1, 2], layout = room, layoutRevision = revision, environment = "dev", blueprintVersion) {
  const json = JSON.stringify(layout).replaceAll("'", "''");
  const ref = blueprintVersion !== undefined;
  sql(`INSERT INTO group_space (group_id, room_json, revision, created_at, updated_at${ref ? ", blueprint_template_key, blueprint_version" : ""})
    SELECT id, '${json}', ${layoutRevision}, now(), now()${ref ? `, '${layout.template}', ${blueprintVersion}` : ""} FROM groups WHERE id IN (${groupIds.join(", ")})
    ON CONFLICT (group_id) DO UPDATE SET room_json = EXCLUDED.room_json, revision = EXCLUDED.revision, updated_at = now()
      ${ref ? ", blueprint_template_key = EXCLUDED.blueprint_template_key, blueprint_version = EXCLUDED.blueprint_version" : ""};`,
  environments[environment].databaseName);
}

function seedAvatar(memberId, hair, outfit, environment = "dev") {
  sql(`INSERT INTO member_avatar (${avatarColumns}, created_at, updated_at)
    VALUES (${memberId}, 1, '${hair}', 'warm', 'chestnut', 'round', 'dot', 'straight', 'small', 'smile', 'none',
      '${outfit}', 'sneakers', 'white', 'none', 'ink', 'none', 'ink', 'none', now(), now());`,
  environments[environment].databaseName);
}

async function startDatabase() {
  const migrations = path.join(root, "backend/src/main/resources/db/migration");
  const schema = [];
  for (const file of ["V1__baseline.sql", "V39__member_avatar.sql", "V40__group_space.sql"]) {
    schema.push(await readFile(path.join(migrations, file), "utf8"));
  }
  for (const db of Object.values(environments)) {
    const { databaseName, reader, password, container } = db;
    docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD", "postgres:17"],
    { env: { ...process.env, POSTGRES_PASSWORD: databasePassword } });
    startedDatabases.push(container);
    await waitFor(() => {
      try {
        docker(["exec", container, "pg_isready", "--host", "127.0.0.1", "--quiet"], { stdio: "ignore" });
        return true;
      } catch { return false; }
    }, "PostgreSQL " + databaseName, 30000);
    db.port = docker(["port", container, "5432/tcp"]).trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    assert.ok(db.port, "PostgreSQL must bind to a dynamic loopback port");
    sql(`
      CREATE ROLE ${reader} LOGIN PASSWORD '${password}';
      CREATE DATABASE ${databaseName};
      REVOKE CONNECT ON DATABASE ${databaseName} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${databaseName} TO ${reader};
    `, "postgres", db);
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
  for (const [environment, { databaseName }] of Object.entries(environments)) {
    sql(`INSERT INTO groups (id, created_at, updated_at, introduction, name, status, type, meeting_type)
        VALUES (11, now(), now(), 'Fixture', 'Published blueprint room', 'ACTIVE', 'CLUB', 'OFFLINE'),
               (12, now(), now(), 'Fixture', 'Cold blueprint room', 'ACTIVE', 'CLUB', 'OFFLINE');`, databaseName);
    saveLayout([11, 12], { ...room, items: [] }, 1, environment);
  }
}

async function migrateBlueprints(environment, wallWidth) {
  const { databaseName, reader } = environments[environment];
  const directory = path.join(root, "backend/src/main/resources/db/migration");
  const migration = await readFile(path.join(directory, "V45__versioned_space_blueprints.sql"), "utf8");
  const catalog = await readFile(path.join(directory, "V46__space_furniture_catalog.sql"), "utf8");
  const runtime = await readFile(path.join(directory, "V47__space_blueprint_runtime.sql"), "utf8");
  sql(`BEGIN;
    ${migration}
    GRANT SELECT (blueprint_template_key, blueprint_version) ON group_space TO ${reader};
    GRANT SELECT (template_key, blueprint_version, geometry_schema_version, geometry) ON space_blueprint TO ${reader};
    GRANT SELECT (template_key, blueprint_version) ON space_blueprint_default TO ${reader};
    GRANT SELECT (version) ON space_blueprint_migration TO ${reader};
    COMMIT;`, databaseName);
  sql(`BEGIN; ${catalog} COMMIT;`, databaseName);
  sql(`BEGIN; ${runtime} COMMIT;`, databaseName);
  assert.equal(sql("SELECT version FROM space_runtime_migration;", databaseName).trim(), "1");
  assert.equal(sql("SELECT version FROM space_blueprint_migration;", databaseName).trim(), "1");
  assert.equal(sql("SELECT blueprint_template_key || ':' || blueprint_version FROM group_space WHERE group_id = 11;", databaseName).trim(), "lounge:11");
  const blocker = JSON.stringify([{ x: -2, z: 6.8, width: wallWidth, depth: wallWidth, height: 2 }]);
  sql(`INSERT INTO space_blueprint (template_key, blueprint_version, geometry_schema_version, geometry)
    SELECT 'lounge', version, 1, jsonb_set(geometry, '{walls}', geometry->'walls' || '${blocker}'::jsonb)
    FROM space_blueprint CROSS JOIN (VALUES (13), (15)) AS published(version)
    WHERE template_key = 'lounge' AND blueprint_version = 11;
    INSERT INTO space_blueprint_runtime (template_key, blueprint_version, spawn)
    SELECT 'lounge', version, spawn FROM space_blueprint_runtime CROSS JOIN (VALUES (13), (15)) AS published(version)
    WHERE template_key = 'lounge' AND blueprint_version = 11;
    UPDATE space_furniture_catalog SET placeable = false WHERE kind IN ('sofa', 'propPlant');
    INSERT INTO groups (id, created_at, updated_at, introduction, name, status, type, meeting_type)
      VALUES (16, now(), now(), 'Fixture', 'Unsaved lounge', 'ACTIVE', 'CLUB', 'OFFLINE'),
             (17, now(), now(), 'Fixture', 'Environment furniture', 'ACTIVE', 'CLUB', 'OFFLINE'),
             (18, now(), now(), 'Fixture', 'Published spawn', 'ACTIVE', 'CLUB', 'OFFLINE');
    INSERT INTO space_blueprint (template_key, blueprint_version, geometry_schema_version, geometry)
      SELECT 'lounge', 18, 1, geometry FROM space_blueprint WHERE template_key='lounge' AND blueprint_version=11;
    INSERT INTO space_blueprint_runtime (template_key, blueprint_version, spawn)
      VALUES ('lounge', 18, jsonb_build_object('x', ${wallWidth}, 'z', 7));
    INSERT INTO space_furniture_catalog (kind, display_order, min_room_version, placeable, definition)
      SELECT 'publishedShelf', 900, 11, false, definition || jsonb_build_object('width', ${wallWidth},
        'depth', ${wallWidth}, 'height', 3, 'surfaces', jsonb_build_array(${environment === "dev" ? 0.25 : 2.75}))
      FROM space_furniture_catalog WHERE kind = 'table';`, databaseName);
  saveLayout([18], { ...room, items: [] }, 1, environment, 18);
  saveLayout([17], { ...room, items: [
    { id: "support", kind: "publishedShelf", x: -2, z: 6.8, rotation: 0 },
    { id: "plant", kind: "propPlant", x: -2, z: 6.8, rotation: 1, parentId: "support", surfaceIndex: 0 }
  ] }, 9, environment, 11);
  saveLayout([11], { ...room, items: [] }, 2, environment, 13);
  saveLayout([12], { ...room, items: [] }, 2, environment, 15);
}

function startServer(extraArgs = [], jar = candidateJar) {
  const environmentSettings = {};
  for (const [environment, { databaseName, reader, password, tokenKey, port }] of Object.entries(environments)) {
    const prefix = `REALTIME_${environment.toUpperCase()}`;
    environmentSettings[`${prefix}_TOKEN_KEY`] = tokenKey.toString("base64url");
    environmentSettings[`${prefix}_DB_JDBC_URL`] = `jdbc:postgresql://127.0.0.1:${port}/${databaseName}`;
    environmentSettings[`${prefix}_DB_USERNAME`] = reader;
    environmentSettings[`${prefix}_DB_PASSWORD`] = password;
  }
  const allowedOrigins = ["http://localhost:5193", "http://127.0.0.1:5193"];
  if (browserPreview) allowedOrigins.push(browserPreview.originUrl);
  const child = spawn(java, ["-jar", jar,
    "--server.port=0", "--realtime.refresh-interval-ms=200", "--realtime.reconnect-grace-ms=3000",
    `--realtime.allowed-origins=${allowedOrigins.join(",")}`, ...extraArgs], {
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
    assert.deepEqual(client.close, { code: options.expectedCloseCode ?? 4001, reason: options.expectedError });
    assert.equal(client.state, null);
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

async function checkLiveRoom(client, initial, revision) {
  await waitFor(() => client.state.layoutRevision === revision, `layout revision ${revision} on the original socket`);
  const start = client.messages.length;
  client.socket.send(JSON.stringify({ type: "RESYNC", ...context(client) }));
  const snapshot = await waitFor(() => client.messages.slice(start).find(message => message.type === "ROOM_SNAPSHOT"), "fresh snapshot on the original socket");
  assert.equal(snapshot.roomEpoch, initial.roomEpoch);
  assert.equal(snapshot.connectionGeneration, initial.connectionGeneration);
  assert.equal(snapshot.layoutRevision, revision);
  return snapshot.participants.find(actor => actor.memberId === "101").position;
}

async function command(client, payload, extra = {}) {
  const commandId = extra.commandId ?? randomUUID();
  const start = client.messages.length;
  client.socket.send(JSON.stringify({ type: "COMMAND", ...context(client), commandId, payload, ...extra }));
  return waitFor(() => client.messages.slice(start).find((message) => message.type === "COMMAND_RESULT" && message.commandId === commandId)
    || client.messages.slice(start).find((message) => message.type === "ERROR"), `command ${payload.action}`);
}

async function stopServer(server) {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolve) => {
    const timer = setTimeout(() => { server.kill("SIGKILL"); }, 12000);
    server.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  server.kill("SIGTERM");
  await stopped;
}

try {
  if (process.argv.includes("--browser")) {
    const browser = await import("./verify-browser.mjs");
    browserPreview = await browser.startBrowserPreview(root);
    verifyBrowser = browser.verifyBrowser;
  }
  await startDatabase();
  let live;
  if (previousJar) {
    previousServer = startServer([], previousJar);
    const oldPort = await waitFor(() => serverLog.match(/Tomcat started on port (\d+)/)?.[1], "previous server startup", 45000);
    live = await connect("ws://127.0.0.1:" + oldPort + "/ws/realtime", "101");
  }
  async function checkRuntime() {
    const probe = startServer(["--check-runtime"]);
    const exitCode = await waitFor(() => probe.exitCode === null ? false : { code: probe.exitCode }, "two-database runtime preflight", 45000);
    return exitCode.code;
  }
  const savedRows = Object.fromEntries(Object.entries(environments).map(([environment, { databaseName }]) =>
    [environment, sql("SELECT revision, room_json FROM group_space WHERE group_id = 1;", databaseName)]));
  assert.notEqual(await checkRuntime(), 0);
  await migrateBlueprints("dev", 1);
  assert.notEqual(await checkRuntime(), 0);
  if (live) {
    assert.equal(previousServer.exitCode, null);
    assert.equal((await command(live, { action: "SIT", assetId: "seat", slot: 0 })).success, true);
    receipt.push("the previous release keeps serving its existing socket after the candidate rejects a development-only migration");
    live.socket.close(1000, "LEAVE");
  }
  await migrateBlueprints("prod", 3);
  for (const [column, table] of [["spawn", "space_blueprint_runtime"], ["default_room", "space_blueprint_runtime"], ["definition", "space_furniture_catalog"]]) {
    const { databaseName, reader } = environments.prod;
    sql(`REVOKE SELECT (${column}) ON ${table} FROM ${reader};`, databaseName);
    assert.notEqual(await checkRuntime(), 0, "candidate must read " + table + "." + column);
    sql(`GRANT SELECT (${column}) ON ${table} TO ${reader};`, databaseName);
  }
  assert.equal(await checkRuntime(), 0);
  receipt.push("preflight requires migrated blueprint tables, catalog, references and grants in both databases");
  for (const [environment, { databaseName }] of Object.entries(environments)) {
    assert.equal(sql("SELECT revision, room_json FROM group_space WHERE group_id = 1;", databaseName), savedRows[environment]);
    assert.equal(sql("SELECT blueprint_template_key || ':' || blueprint_version FROM group_space WHERE group_id = 1;", databaseName).trim(), "lounge:11");
  }
  receipt.push("both migrations pin existing saved rooms and preserve their furniture JSON and revision");
  if (previousServer) await stopServer(previousServer);
  serverLog = "";
  server = startServer();
  const port = await waitFor(() => {
    if (!server.pid || server.exitCode !== null) throw new Error(`Server exited: ${serverLog.slice(-8000)}`);
    return serverLog.match(/Tomcat started on port (\d+)/)?.[1];
  }, "Spring startup", 45000);
  const realtimeOrigin = `http://127.0.0.1:${port}`;
  browserPreview?.setRealtimeOrigin(realtimeOrigin);
  const definitions = await fetch(`${realtimeOrigin}/ws/realtime`, {
    headers: { Origin: "https://frontend.example" },
    signal: AbortSignal.timeout(5000)
  });
  assert.equal(definitions.status, 200);
  assert.equal(definitions.headers.get("access-control-allow-origin"), "*");
  assert.equal(definitions.headers.get("access-control-allow-credentials"), null);
  const { success, data } = await definitions.json();
  assert.equal(success, true);
  const contracts = path.join(root, "realtime/src/main/resources/contracts");
  assert.deepEqual(data, { capabilities: JSON.parse(await readFile(path.join(contracts, "asset-capabilities.json"), "utf8")) });
  assert.equal(data.capabilities.assets.cafeCabinet.surface.slots, 1);
  assert.equal(data.capabilities.assets.cafeCabinet.storage.capacity, 8);
  receipt.push("public cross-origin GET returns the capability rules, including separate surface and storage limits");
  const healthUrl = `${realtimeOrigin}/actuator/health`;
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
  const shelfPositions = {};
  for (const [environment, db] of Object.entries(environments)) {
    const unsaved = await connect(url, "101", "16", { environment });
    assert.equal(unsaved.state.layoutRevision, 0);
    assert.deepEqual(participant(unsaved, "101").position, { x: -2, y: 0, z: 6.8 });
    const bench = await command(unsaved, { action: "SIT", assetId: "entrance-bench", slot: 0 });
    const absent = await command(unsaved, { action: "SIT", assetId: "missing-bench", slot: 0 });
    assert.equal(absent.code, "ASSET_NOT_FOUND");
    assert.ok(bench.success || bench.code === "TOO_FAR", JSON.stringify(bench));
    unsaved.socket.close(1000, "LEAVE");
    assert.equal(sql("SELECT count(*) FROM group_space WHERE group_id = 16;", db.databaseName).trim(), "0");
    const shelf = await connect(url, "101", "17", { environment });
    assert.equal(shelf.state.layoutRevision, 9);
    shelfPositions[environment] = participant(shelf, "101").position;
    const water = await command(shelf, { action: "WATER", assetId: "plant" });
    assert.equal(water.success, environment === "dev", JSON.stringify(water));
    if (environment === "prod") assert.equal(water.code, "TOO_FAR");
    const published = await connect(url, "101", "18", { environment });
    assert.deepEqual(participant(published, "101").position, { x: environment === "dev" ? 1 : 3, y: 0, z: 7 });
    published.socket.close(1000, "LEAVE");
    shelf.socket.close(1000, "LEAVE");
  }
  assert.notDeepEqual(shelfPositions.dev, shelfPositions.prod);
  receipt.push("both unsaved rooms use the original flat lounge, entry bench and spawn at revision zero without inserting a row");
  receipt.push("the same retired shelf key has different collision bounds and attachment heights in each database; a retired plant is reachable only on the lower surface");
  receipt.push("a published blueprint has different spawn coordinates in development and production for the same template and version");
  const devMap = await connect(url, "101", "11");
  const prodMap = await connect(url, "101", "11", { environment: "prod" });
  const devInitial = context(devMap), prodInitial = context(prodMap);
  const defaultSpawn = { x: -2, y: 0, z: 6.8 };
  const devStart = await checkLiveRoom(devMap, devInitial, 2);
  const prodStart = await checkLiveRoom(prodMap, prodInitial, 2);
  assert.notDeepEqual(devStart, defaultSpawn);
  assert.notDeepEqual(prodStart, defaultSpawn);
  assert.notDeepEqual(prodStart, devStart);
  receipt.push("both environments read a DB-only version and apply their own geometry for the same key and version");

  const { databaseName: devDb, reader: devReader } = environments.dev;
  sql(`REVOKE SELECT (geometry) ON space_blueprint FROM ${devReader};`, devDb);
  assert.equal((await checkHealth()).status, 503);
  await connect(url, "101", "12", { expectedError: "BACKEND_UNAVAILABLE", expectedCloseCode: 4004 });
  assert.deepEqual(await checkLiveRoom(prodMap, prodInitial, 2), prodStart);
  sql(`GRANT SELECT (geometry) ON space_blueprint TO ${devReader};`, devDb);
  assert.equal((await checkHealth()).status, 200);
  const recovered = await connect(url, "101", "12");
  assert.deepEqual(participant(recovered, "101").position, devStart);
  recovered.socket.close(1000, "LEAVE");
  receipt.push("a development reader denied geometry cannot join a cold room and recovers on grant restoration");

  const { reader: prodReader, databaseName: prodDb } = environments.prod;
  sql(`REVOKE SELECT (blueprint_version) ON space_blueprint_default FROM ${prodReader};`, prodDb);
  assert.notEqual(await checkRuntime(), 0);
  sql(`GRANT SELECT (blueprint_version) ON space_blueprint_default TO ${prodReader};`, prodDb);
  // Terminate only the production reader's connections, and prevent Hikari from immediately opening new ones.
  sql(`ALTER DATABASE ${prodDb} ALLOW_CONNECTIONS false;
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${prodDb}' AND usename = '${prodReader}';`, "postgres", environments.prod);
  try {
    const [unaffected, , failedHealth] = await Promise.all([
      connect(url, "102", "11"), connect(url, "101", "12", { environment: "prod", expectedError: "BACKEND_UNAVAILABLE", expectedCloseCode: 4004 }),
      checkHealth()
    ]);
    assert.equal(failedHealth.status, 503);
    assert.equal(unaffected.state.layoutRevision, 2);
    assert.deepEqual(participant(unaffected, "101").position, devStart);
    assert.deepEqual(await checkLiveRoom(devMap, devInitial, 2), devStart);
    unaffected.socket.close(1000, "LEAVE");
  } finally {
    sql(`ALTER DATABASE ${prodDb} ALLOW_CONNECTIONS true;`, "postgres", environments.prod);
  }
  assert.equal(await checkRuntime(), 0);
  assert.equal((await checkHealth()).status, 200);
  const restored = await connect(url, "101", "12", { environment: "prod" });
  assert.deepEqual(participant(restored, "101").position, prodStart);
  restored.socket.close(1000, "LEAVE");
  devMap.socket.close(1000, "LEAVE");
  prodMap.socket.close(1000, "LEAVE");
  receipt.push("a production PostgreSQL disconnection refuses a new production admission while a new development admission succeeds, and the same JVM recovers when production reconnects");
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

  const prop = (id) => a.state.items.find((item) => item.id === id);
  assert.equal((await command(a, { action: "PICKUP", itemId: cupId })).success, true);
  assert.equal((await command(a, { action: "PLACE", assetId: "table", slot: 1, itemId: cupId })).code, "INVALID_SLOT");
  assert.equal(self().heldItemId, cupId);
  assert.equal((await command(a, { action: "PRODUCE", assetId: "counter", kind: "coffee", itemId: cupId })).success, true);
  await waitFor(() => prop(cupId)?.kind === "coffee", "coffee finishes");
  assert.deepEqual([prop(cupId).location, prop(cupId).assetId, prop(cupId).slot], ["SURFACE", "counter", 0]);
  assert.equal((await command(a, { action: "OPEN", assetId: "counter" })).success, true);
  assert.equal((await command(a, { action: "TAKE", assetId: "counter", kind: "tea" })).success, true);
  await waitFor(() => self().heldItemId, "held tea");
  const teaId = self().heldItemId;
  assert.equal((await command(a, { action: "PLACE", assetId: "counter", slot: 0, itemId: teaId })).code, "OCCUPIED");
  assert.equal((await command(a, { action: "RETURN", assetId: "counter", itemId: teaId })).success, true);
  await waitFor(() => prop(teaId)?.location === "STORAGE", "tea is stored");
  assert.deepEqual([prop(teaId).assetId, prop(teaId).slot], ["counter", 0]);
  assert.deepEqual([prop(cupId).assetId, prop(cupId).slot], ["counter", 0]);
  receipt.push("coffee production finishes on the surface and storage can independently occupy slot zero");

  assert.equal((await command(a, { action: "PICKUP", itemId: cupId })).success, true);
  assert.equal((await command(a, { action: "PLACE", assetId: "table", slot: 0, itemId: cupId })).success, true);
  await waitFor(() => a.state.items.find((item) => item.id === cupId)?.assetId === "table", "cup on surface");
  const surfaceX = a.state.items.find((item) => item.id === cupId).position.x;
  room.items = room.items.map((asset) => asset.id === "table" ? { ...asset, x: asset.x - 0.5 } : asset);
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "surface moved");
  assert.deepEqual([prop(cupId).location, prop(cupId).assetId, prop(cupId).slot], ["SURFACE", "table", 0]);
  assert.ok(Math.abs(prop(cupId).position.x - surfaceX + 0.5) < 0.0001);
  room.items = room.items.filter((asset) => asset.id !== "table");
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "surface removed");
  assert.equal(prop(cupId), undefined);
  assert.equal(prop(teaId).location, "STORAGE");
  room.items = room.items.filter((asset) => asset.id !== "counter");
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "storage removed");
  assert.equal(prop(teaId), undefined);
  assert.equal(prop(itemId).location, "WORLD");
  room.items.push({ id: "counter", kind: "cafeCabinet", x: 0, z: 5.8, rotation: 0 });
  revision += 1;
  saveLayout();
  await waitFor(() => a.state.layoutRevision === revision, "producer restored for reconnect");
  receipt.push("furniture movement preserves its slot and legacy wire position follows; deleting furniture removes only attached and stored props");

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
    const defaultRoom = JSON.parse(sql("SELECT default_room FROM space_blueprint_runtime WHERE template_key='lounge' AND blueprint_version=11"));
    Object.assign(room, defaultRoom, {
      items: [{ id: "camera", kind: "cameraCabinet", x: -5, z: 6.5, rotation: 0 }]
    });
    revision += 1;
    sql(`INSERT INTO space_blueprint (template_key, blueprint_version, geometry_schema_version, geometry)
      SELECT 'lounge', 14, 1, geometry || '{"upperName":"브라우저 검증용 복층"}'::jsonb
      FROM space_blueprint WHERE template_key = 'lounge' AND blueprint_version = 12;
      INSERT INTO space_blueprint_runtime (template_key, blueprint_version, spawn)
      VALUES ('lounge', 14, '{"x":-2,"z":6.8}');`);
    saveLayout([10], room, revision, "dev", 14);
    const snapshot = JSON.parse(sql(`SELECT json_build_object(
        'room', s.room_json::json, 'revision', s.revision,
        'blueprintRef', json_build_object('templateKey', b.template_key, 'version', b.blueprint_version),
        'geometry', b.geometry, 'spawn', r.spawn, 'defaultRoom', null)
      FROM group_space s JOIN space_blueprint b
        ON s.blueprint_template_key = b.template_key AND s.blueprint_version = b.blueprint_version
      JOIN space_blueprint_runtime r ON r.template_key=b.template_key AND r.blueprint_version=b.blueprint_version
      WHERE s.group_id = 10;`));
    assert.equal(snapshot.room.version, 11);
    assert.equal(snapshot.blueprintRef.version, 14);
    receipt.push(...await verifyBrowser({ root, originUrl: browserPreview.originUrl, url, token, snapshot, evidence }));
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
  await Promise.all([stopServer(server), stopServer(previousServer)]);
  await writeFile(path.join(evidence, "server.log"), serverLog);
  for (const container of startedDatabases) docker(["rm", "-f", container]);
  await unlink(candidateJar);
}
