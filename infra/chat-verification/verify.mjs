import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const WebSocket = require("ws");
export const localSecret = "local-chat-verification-secret-not-for-production-20261025";
export const blue = process.env.CHAT_BLUE_URL ?? "http://127.0.0.1:8095";
export const green = process.env.CHAT_GREEN_URL ?? "http://127.0.0.1:8096";
const origin = process.env.CHAT_UI_ORIGIN ?? "http://127.0.0.1:5176";
for (const url of [blue, green, origin]) assert.equal(new URL(url).hostname, "127.0.0.1", "Verification requires loopback");

export function token(memberId, lifetime = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256" })}.${encode({ sub: String(memberId), iat: now, exp: now + lifetime })}`;
  return `${unsigned}.${createHmac("sha256", localSecret).update(unsigned).digest("base64url")}`;
}

export function user(memberId, lifetime = 3600) {
  const csrf = randomUUID();
  const accessToken = token(memberId, lifetime);
  return { memberId, csrf, accessToken, cookie: `accessToken=${accessToken}; XSRF-TOKEN=${csrf}` };
}

export async function request(account, server, route, method = "GET", body) {
  const response = await fetch(`${server}/api${route}`, {
    method,
    headers: { ...(account ? { Cookie: account.cookie, "X-XSRF-TOKEN": account.csrf } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000)
  });
  const json = response.status === 204 ? null : await response.json();
  return { status: response.status, data: json?.data, error: json?.error };
}

export async function until(predicate, label, timeout = 8000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await delay(25);
  }
  throw new Error(`Timed out: ${label}`);
}

export async function socket(account, server, destination = "/user/queue/chat-events", csrf = account.csrf) {
  const ws = new WebSocket(`${server.replace("http", "ws")}/api/ws/chat`, ["v12.stomp"], {
    headers: { Cookie: account.cookie, Origin: origin }
  });
  const state = { ws, events: [], connected: false, closed: false, errors: [] };
  ws.on("error", (error) => state.errors.push(error.message));
  ws.on("close", () => { state.closed = true; });
  ws.on("open", () => ws.send(`CONNECT\naccept-version:1.2\nhost:localhost\nheart-beat:0,0\nX-XSRF-TOKEN:${csrf}\n\n\0`));
  let buffer = "";
  ws.on("message", (raw) => {
    buffer += raw.toString();
    while (buffer.includes("\0")) {
      const index = buffer.indexOf("\0");
      const frame = buffer.slice(0, index).replace(/^\n+/, "");
      buffer = buffer.slice(index + 1);
      if (frame.startsWith("CONNECTED\n")) {
        state.connected = true;
        ws.send(`SUBSCRIBE\nid:chat\ndestination:${destination}\nack:auto\n\n\0`);
      } else if (frame.startsWith("MESSAGE\n")) {
        state.events.push({ value: JSON.parse(frame.slice(frame.indexOf("\n\n") + 2)), receivedAt: performance.now() });
      } else if (frame.startsWith("ERROR\n")) state.errors.push("STOMP_ERROR");
    }
  });
  await until(() => state.connected || state.closed || state.errors.length > 0, "STOMP connect");
  return state;
}

export async function history(account, server, groupId, cursor = "0") {
  const items = [];
  let hasNext;
  do {
    const result = await request(account, server, `/groups/${groupId}/chat/messages?afterSequence=${cursor}&size=100`);
    assert.equal(result.status, 200, JSON.stringify(result));
    items.push(...result.data.items);
    ({ hasNext } = result.data);
    if (hasNext) {
      assert.ok(result.data.nextCursor && result.data.nextCursor !== cursor, "Catch-up must advance");
      cursor = result.data.nextCursor;
    }
  } while (hasNext);
  return items;
}

async function functional() {
  const a = user(901001), b = user(901002), outsider = user(901105);
  const sockets = [];
  try {
    const [aBlue, bGreen, aGreen, outsiderBlue] = await Promise.all([
      socket(a, blue), socket(b, green), socket(a, green), socket(outsider, blue)
    ]);
    sockets.push(aBlue, bGreen, aGreen, outsiderBlue);
    for (const state of sockets) assert.ok(state.connected && !state.closed, "Authenticated connection");
    await delay(200);
    const groupId = "902001";
    const route = `/groups/${groupId}/chat/messages`;
    const clientMessageId = randomUUID();
    const first = await request(a, blue, route, "POST", { clientMessageId, content: `두 서버 전달 ${clientMessageId}` });
    assert.equal(first.status, 201, JSON.stringify(first));
    await until(() => [aBlue, bGreen, aGreen].every((s) => s.events.some((e) => e.value.message?.id === first.data.id)), "cross-server and multi-window fanout");
    assert.ok(!outsiderBlue.events.some((e) => e.value.message?.id === first.data.id));
    console.log("PASS cross-server delivery, same-user windows, non-member exclusion");

    const id = randomUUID();
    const repeated = await Promise.all(Array.from({ length: 20 }, (_, i) => request(a, i % 2 ? blue : green, route, "POST", { clientMessageId: id, content: "동시 멱등 요청" })));
    assert.equal(repeated.filter((r) => r.status === 201).length, 1);
    assert.equal(repeated.filter((r) => r.status === 200).length, 19);
    assert.equal(new Set(repeated.map((r) => r.data.id)).size, 1);
    assert.equal((await request(a, blue, route, "POST", { clientMessageId: id, content: "다른 본문" })).status, 409);
    console.log("PASS 20 simultaneous retries save exactly one message; changed body conflicts");

    assert.equal((await request(null, blue, route)).status, 401);
    assert.equal((await request(outsider, green, route)).status, 403);
    assert.equal((await request(outsider, blue, route, "POST", { clientMessageId: randomUUID(), content: "권한 없음" })).status, 403);
    for (const content of ["   ", "😀".repeat(1001)]) {
      assert.equal((await request(a, blue, route, "POST", { clientMessageId: randomUUID(), content })).status, 400);
    }
    assert.equal((await request(a, blue, `${route}?beforeSequence=3&afterSequence=1`)).status, 400);
    console.log("PASS HTTP authorization and UTF-16/cursor validation");

    for (const destination of ["/queue/chat-events", "/topic/chat", "/user/901002/queue/chat-events"]) {
      const invalid = await socket(a, blue, destination); sockets.push(invalid);
      await until(() => invalid.closed || invalid.errors.length > 0, "invalid subscription denied");
    }
    const badCsrf = await socket(a, green, "/user/queue/chat-events", "wrong"); sockets.push(badCsrf);
    await until(() => badCsrf.closed || badCsrf.errors.length > 0, "CONNECT CSRF denied");
    const sender = await socket(a, blue); sockets.push(sender);
    sender.ws.send("SEND\ndestination:/app/chat\ncontent-type:application/json\n\n{}\0");
    await until(() => sender.closed || sender.errors.length > 0, "STOMP SEND denied");
    const expiring = await socket(user(901001, 3), green); sockets.push(expiring);
    await until(() => expiring.closed, "expired token connection closed", 6500);
    console.log("PASS subscription restrictions, CONNECT CSRF, SEND rejection, token expiry");

    const reply = await request(b, green, route, "POST", { clientMessageId: randomUUID(), content: "다른 서버에서 보낸 답장" });
    assert.equal(reply.status, 201);
    const readRoute = `/groups/${groupId}/chat/read`;
    const readStart = bGreen.events.length;
    const read = await request(a, green, readRoute, "PUT", { lastReadSequence: reply.data.sequence });
    assert.equal(read.status, 200);
    const staleRead = await request(a, blue, readRoute, "PUT", { lastReadSequence: "0" });
    assert.equal(staleRead.data.lastReadSequence, reply.data.sequence);
    assert.equal(staleRead.data.unreadCount, 0);
    await until(() => aBlue.events.some((e) => e.value.type === "READ_STATE_UPDATED" && e.value.lastReadSequence === reply.data.sequence), "read state crosses servers");
    assert.ok(!bGreen.events.slice(readStart).some((e) => e.value.type === "READ_STATE_UPDATED"));
    console.log("PASS monotonic private read state across servers");

    const hundred = await Promise.all(Array.from({ length: 100 }, (_, i) => request(i % 2 ? a : b, i % 2 ? blue : green, route, "POST", { clientMessageId: randomUUID(), content: `순서 검증 ${i}` })));
    assert.ok(hundred.every((r) => r.status === 201));
    const caught = await history(a, green, groupId);
    assert.equal(new Set(caught.map((m) => m.id)).size, caught.length);
    for (let i = 1; i < caught.length; i++) assert.equal(BigInt(caught[i].sequence), BigInt(caught[i - 1].sequence) + 1n);
    for (const saved of hundred) assert.ok(caught.some((m) => m.id === saved.data.id));
    console.log("PASS 100 concurrent writes and multi-page ordered catch-up");

    const created = await request(a, blue, "/groups", "POST", { type: "STUDY", name: `종료검증 ${randomUUID().slice(0, 8)}`, introduction: "로컬 격리 검증", description: "", meetingType: "ONLINE" });
    assert.equal(created.status, 201, JSON.stringify(created));
    const temporaryId = String(created.data.id);
    assert.match(temporaryId, /^\d+$/);
    execFileSync("docker", ["exec", "jarihana-postgres", "psql", "-U", "jarihana", "-d", "jarihana_chat_realtime", "-v", "ON_ERROR_STOP=1", "-c", `UPDATE groups SET created_at = localtimestamp - interval '25 hours' WHERE id = ${temporaryId} AND name LIKE '종료검증 %'`]);
    const temporaryRoute = `/groups/${temporaryId}/chat/messages`;
    const saved = { clientMessageId: randomUUID(), content: "종료 전에 저장" };
    assert.equal((await request(a, blue, temporaryRoute, "POST", saved)).status, 201);
    assert.equal((await request(a, green, `/groups/${temporaryId}`, "PATCH", { status: "ENDED" })).status, 200);
    assert.equal((await request(a, blue, temporaryRoute, "POST", saved)).status, 200);
    assert.ok([400, 409].includes((await request(a, blue, temporaryRoute, "POST", { clientMessageId: randomUUID(), content: "종료 후 금지" })).status));
    assert.equal((await request(a, green, temporaryRoute)).status, 200);
    await until(() => aBlue.events.some((e) => e.value.type === "ROOM_CLOSED" && e.value.groupId === temporaryId), "end event crosses servers");
    const deletable = await request(a, blue, "/groups", "POST", { type: "STUDY", name: `삭제검증 ${randomUUID().slice(0, 8)}`, introduction: "로컬 격리 검증", description: "", meetingType: "ONLINE" });
    assert.equal(deletable.status, 201);
    const deletedId = String(deletable.data.id);
    const deletedRoute = `/groups/${deletedId}/chat/messages`;
    assert.equal((await request(a, blue, deletedRoute, "POST", { clientMessageId: randomUUID(), content: "삭제할 메시지" })).status, 201);
    assert.equal((await request(a, green, `/groups/${deletedId}`, "DELETE")).status, 204);
    assert.ok([403, 404].includes((await request(a, blue, deletedRoute)).status));
    await until(() => aBlue.events.some((e) => e.value.type === "ROOM_REMOVED" && e.value.groupId === deletedId), "deletion event to pre-delete recipients");
    console.log("PASS end/read-only/idempotent retry and group deletion across servers");
  } finally {
    for (const state of sockets) state.ws.close();
  }
}

async function load() {
  const duration = Number(process.env.CHAT_LOAD_SECONDS ?? 300);
  const sessions = await Promise.all(Array.from({ length: 100 }, (_, i) => socket(user(901001 + i), i % 2 ? blue : green)));
  const sent = [];
  const start = performance.now();
  try {
    assert.ok(sessions.every((s) => s.connected && !s.closed));
    await delay(300);
    for (let i = 0; i < duration * 10; i++) {
      const groupId = String(902001 + i % 10);
      const response = await request(user(901001 + i % 100), i % 2 ? blue : green, `/groups/${groupId}/chat/messages`, "POST", { clientMessageId: randomUUID(), content: `로컬 부하 ${i}` });
      assert.equal(response.status, 201, JSON.stringify(response));
      sent.push({ id: response.data.id, groupId, savedAt: performance.now() });
      const nextAt = start + (i + 1) * 100;
      if (nextAt > performance.now()) await delay(nextAt - performance.now());
      if ((i + 1) % 300 === 0) console.log(`LOAD ${i + 1}/${duration * 10} messages saved`);
    }
    const ids = new Set(sent.map((m) => m.id));
    await until(() => sessions.every((s) => new Set(s.events.filter((e) => ids.has(e.value.message?.id)).map((e) => e.value.message.id)).size === sent.length), "all load messages delivered", 15000);
    const savedAt = new Map(sent.map((m) => [m.id, m.savedAt]));
    const latencies = sessions.flatMap((s) => s.events.filter((e) => ids.has(e.value.message?.id)).map((e) => Math.max(0, e.receivedAt - savedAt.get(e.value.message.id)))).sort((a, b) => a - b);
    for (let i = 0; i < 10; i++) {
      const groupId = String(902001 + i);
      const rows = await history(user(901001), green, groupId);
      const found = new Set(rows.map((m) => m.id));
      assert.ok(sent.filter((m) => m.groupId === groupId).every((m) => found.has(m.id)));
    }
    console.log(JSON.stringify({ sockets: 100, rooms: 10, saved: sent.length, deliveries: latencies.length, seconds: (performance.now() - start) / 1000, p95Ms: latencies[Math.floor(latencies.length * .95)], p99Ms: latencies[Math.floor(latencies.length * .99)] }));
  } finally { for (const state of sessions) state.ws.close(); }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await (process.argv.includes("--load") ? load() : functional());
}
