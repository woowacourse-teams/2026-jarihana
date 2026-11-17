import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { createInterface } from "node:readline";

const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { servers, topics, clients, rate, seconds, hot, member, key } = config;
const now = () => performance.now();

function accessToken() {
    const issued = Math.floor(Date.now() / 1000);
    const encode = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
    const unsigned = [
        encode({ alg: "HS256" }),
        encode({ sub: String(member), iat: issued, exp: issued + 3600 }),
    ].join(".");
    return unsigned + "." + createHmac("sha256", key).update(unsigned).digest("base64url");
}

const csrfResponse = await fetch(servers[0] + "/groups?size=1");
if (!csrfResponse.ok) throw Error("CSRF bootstrap returned " + csrfResponse.status);
const csrf = csrfResponse.headers.get("set-cookie")?.match(/XSRF-TOKEN=([^;]+)/)?.[1];
await csrfResponse.arrayBuffer();
if (!csrf) throw Error("CSRF bootstrap did not issue XSRF-TOKEN");
const writeHeaders = {
    "Content-Type": "application/json",
    Cookie: "XSRF-TOKEN=" + csrf + "; accessToken=" + accessToken(),
    "X-XSRF-TOKEN": csrf,
};

const stop = new AbortController();
const subscriptions = [];

function connect(topic, server) {
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const session = { topic, server, ready, arrivals: new Map(), failure: null, updates: 0 };
    subscriptions.push(session);
    session.done = (async () => {
        const response = await fetch(server + "/sparrings/" + topic + "/events", {
            signal: stop.signal,
            headers: { Accept: "text/event-stream" },
        });
        if (!response.ok) throw Error("SSE returned " + response.status);
        let stream = "";
        let event = "";
        let data = [];
        for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
            stream += chunk;
            let newline;
            while ((newline = stream.indexOf("\n")) >= 0) {
                const line = stream.slice(0, newline).replace(/\r$/, "");
                stream = stream.slice(newline + 1);
                if (line.startsWith("event:")) event = line.slice(6).trim();
                if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
                if (line !== "") continue;
                const arrived = now();
                if (event === "snapshot") resolveReady();
                if (event === "update") session.updates++;
                if ((event === "snapshot" || event === "update") && data.length) {
                    for (const post of JSON.parse(data.join("\n")).posts) {
                        const previous = session.arrivals.get(post.id);
                        if (previous) previous.count++;
                        else session.arrivals.set(post.id, { first: arrived, count: 1 });
                    }
                }
                event = "";
                data = [];
            }
        }
        throw Error("SSE ended before the benchmark completed");
    })().catch((error) => {
        if (!stop.signal.aborted) {
            session.failure = String(error);
            rejectReady(error);
        }
    });
}

for (let index = 0; index < clients; index++) {
    connect(topics[index % topics.length], servers[Math.floor(index / topics.length) % servers.length]);
}

const startSignal = new Promise((resolve, reject) => {
    const input = createInterface({ input: process.stdin });
    input.once("line", (line) => {
        input.close();
        if (line === "start") resolve();
        else reject(Error("Expected start signal"));
    });
});

function percentile(samples, fraction) {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 100) / 100 : null;
}

try {
    let readyTimeout;
    try {
        const timedOut = new Promise((_, reject) => {
            readyTimeout = setTimeout(() => reject(Error("SSE snapshot timeout")), 45000);
        });
        await Promise.race([Promise.all(subscriptions.map((entry) => entry.ready)), timedOut]);
    } finally {
        clearTimeout(readyTimeout);
    }
    console.log("ready");
    await startSignal;
    const writes = [];
    const errors = new Map();
    const pending = [];
    const schedulerLag = [];
    const start = now();
    let lastCompleted = start;
    for (let index = 0; index < (config.recovery ? topics.length : Math.floor(rate * seconds)); index++) {
        const scheduled = start + (index + 0.5) * 1000 / (config.recovery ? topics.length / seconds : rate);
        if (scheduled > now()) await wait(scheduled - now());
        schedulerLag.push(Math.max(0, now() - scheduled));
        let topicIndex = index % topics.length;
        if (hot) topicIndex = index % 10 ? 0 : Math.floor(index / 10) % topics.length;
        const topic = topics[topicIndex];
        const server = servers[index % servers.length];
        const sent = now();
        pending.push((async () => {
            try {
                const response = await fetch(server + "/sparrings/" + topic + "/posts", {
                    method: "POST",
                    headers: writeHeaders,
                    body: JSON.stringify({ text: "benchmark message " + index, requestId: randomUUID() }),
                    signal: AbortSignal.timeout(10000),
                });
                if (response.status !== 201) {
                    throw Error("HTTP " + response.status + " " + (await response.text()).slice(0, 160));
                }
                const id = (await response.json()).data.id;
                const ack = now();
                writes.push({ index, topic, id, sent, ack });
            } catch (error) {
                const message = String(error);
                errors.set(message, (errors.get(message) ?? 0) + 1);
            } finally {
                lastCompleted = now();
            }
        })());
    }
    await wait(Math.max(0, start + seconds * 1000 - now()));
    await Promise.all(pending);
    await wait(config.drainMs);

    const storage = writes.map(({ sent, ack }) => ack - sent);
    const delivery = [];
    const fromAck = [];
    let expected = 0;
    let duplicate = 0;
    const requestTimings = [];
    for (const { index, topic, id, sent, ack } of writes) {
        const timings = [];
        for (const session of subscriptions) {
            if (session.topic !== topic) continue;
            expected++;
            const arrival = session.arrivals.get(id);
            if (!arrival) continue;
            duplicate += arrival.count - 1;
            delivery.push(arrival.first - sent);
            if (config.notifyLock) timings.push(arrival.first - sent);
            fromAck.push(arrival.first - ack);
        }
        if (config.notifyLock) requestTimings.push([index, id, ack - sent, timings]);
    }
    const committedObservations = new Map();
    if (config.verifyCommitted) {
        for (const session of subscriptions) {
            for (const [id, arrival] of session.arrivals) {
                const observation = committedObservations.get(id) ?? [0, 0];
                observation[0]++;
                observation[1] += arrival.count - 1;
                committedObservations.set(id, observation);
            }
        }
    }
    console.log(JSON.stringify({
        request_timings: config.notifyLock ? requestTimings : undefined,
        committed_observations: config.verifyCommitted ? [...committedObservations] : undefined,
        writes_attempted: pending.length,
        writes_succeeded: writes.length,
        writes_failed: Object.fromEntries(errors),
        storage_tps: writes.length / Math.max(seconds, (lastCompleted - start) / 1000),
        storage_p95_ms: percentile(storage, 0.95),
        storage_p99_ms: percentile(storage, 0.99),
        sse_p50_ms: percentile(delivery, 0.50),
        sse_p95_ms: percentile(delivery, 0.95),
        sse_p99_ms: percentile(delivery, 0.99),
        sse_from_ack_p50_ms: percentile(fromAck, 0.50),
        sse_from_ack_p99_ms: percentile(fromAck, 0.99),
        sse_from_ack_max_ms: percentile(fromAck, 1),
        sse_within_1s: delivery.filter((latency) => latency <= 1000).length,
        sse_from_ack_p95_ms: percentile(fromAck, 0.95),
        sse_expected: expected,
        sse_missing: expected - delivery.length,
        sse_duplicates: duplicate,
        sse_updates: subscriptions.reduce((sum, session) => sum + session.updates, 0),
        sse_disconnected: subscriptions.map((session) => session.failure).filter(Boolean),
        send_scheduler_p95_ms: percentile(schedulerLag, 0.95),
    }));
} finally {
    stop.abort();
    await Promise.all(subscriptions.map((session) => session.done));
    process.stdin.destroy();
}
