/** @jest-environment node */
import { apiRequest, createApiClient } from "../../shared/api/index.js";
import { fetchAssetDefinitions, fetchDefaultSpaceBlueprint, fetchFurnitureCatalog, fetchGroupSpace, MAX_SPACE_BYTES, saveGroupSpace } from "./api.js";

jest.mock("../../shared/api/index.js", () => ({
  ...jest.requireActual("../../shared/api/index.js"), apiRequest: jest.fn()
}));

const seeded = require("../../../tests/fixtures/clubhouse-seeds.cjs").blueprint;
const emptySpace = { ...seeded("lounge", 11), room: null, revision: 0, canEdit: true, updatedAt: null };
const reply = (data, status = 200, code) => new Response(JSON.stringify({
  success: !code, data: code ? null : data, error: code ? { code, message: "server detail" } : null
}), { status, headers: { "content-type": "application/json" } });
let wire;
beforeEach(() => {
  wire = jest.fn().mockImplementation(() => Promise.resolve(reply(emptySpace)));
  const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire,
    cookieSource: () => "XSRF-TOKEN=space%2Btoken" });
  apiRequest.mockImplementation((path, options) => client.request(path, options));
});

test("GET reads the selected group's space with the authenticated cookie transport", async () => {
  expect(await fetchGroupSpace(41)).toEqual(emptySpace);
  expect(wire).toHaveBeenCalledTimes(1);
  const request = wire.mock.calls[0][0];
  expect(request.url).toBe("https://app.test/api/groups/41/space");
  expect(request.method).toBe("GET");
  expect(request.credentials).toBe("include");
});

test("PUT sends room and expectedRevision with CSRF and validates the saved response", async () => {
  const room = { version: 8, name: "우리 아지트" };
  const saved = { room, revision: 3, canEdit: true, updatedAt: "2026-11-09T14:30:00" };
  let sentBody;
  wire.mockImplementationOnce(async (request) => { sentBody = await request.clone().json(); return reply(saved); });
  expect(await saveGroupSpace(42, { room, expectedRevision: 2 })).toEqual(saved);
  const request = wire.mock.calls[0][0];
  expect(request.url).toBe("https://app.test/api/groups/42/space");
  expect(request.method).toBe("PUT");
  expect(request.credentials).toBe("include");
  expect(request.headers.get("X-XSRF-TOKEN")).toBe("space+token");
  expect(sentBody).toEqual({ room, expectedRevision: 2 });
});

test("default geometry is read separately and PUT sends only its reference", async () => {
  const bounds = { minX: -10, maxX: 10, minZ: -8, maxZ: 5 };
  const geometry = { building: { ...bounds, height: 7 }, entrance: bounds, walls: [], clearPaths: [] };
  const blueprintRef = { templateKey: "lounge", version: 13 };
  const release = { ...seeded("lounge"), blueprintRef, geometry };
  wire.mockResolvedValueOnce(reply(release));
  expect(await fetchDefaultSpaceBlueprint("lounge")).toEqual(release);
  expect(wire.mock.calls[0][0].url).toBe("https://app.test/api/group-spaces/blueprints/lounge/default");
  const room = { template: "lounge", version: 11 };
  let body;
  wire.mockImplementationOnce(async request => {
    body = await request.clone().json();
    return reply({ ...emptySpace, room, revision: 1, geometry, blueprintRef });
  });
  const saved = await saveGroupSpace(42, { room, expectedRevision: 0, blueprintRef });
  expect(saved.geometry).toEqual(geometry);
  expect(body).toEqual({ room, expectedRevision: 0, blueprintRef });
  wire.mockImplementationOnce(async request => { body = await request.clone().json(); return reply(saved); });
  await saveGroupSpace(42, { room, expectedRevision: 1, blueprintRef, replaceLayout: true });
  expect(body).toEqual({ room, expectedRevision: 1, blueprintRef, replaceLayout: true });
});

test.each([[409, "GROUP_SPACE_CONFLICT"], [403, "GROUP_SPACE_FORBIDDEN"]])(
  "HTTP %s preserves its code and status without retrying a write", async (status, code) => {
    wire.mockImplementation(() => Promise.resolve(reply(null, status, code)));
    await expect(saveGroupSpace(41, { room: { version: 8 }, expectedRevision: 0 })).rejects.toMatchObject({ status, code });
    expect(wire).toHaveBeenCalledTimes(1);
  }
);

test.each([{ ...emptySpace, spawn: null }, { ...emptySpace, revision: -1 }, { ...emptySpace, room: [] },
  { ...emptySpace, canEdit: "true" }, { ...emptySpace, revision: 2 }])(
  "invalid server state cannot become an editable fallback", async (data) => {
    wire.mockImplementationOnce(() => Promise.resolve(reply(data)));
    await expect(fetchGroupSpace(41)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  }
);

test("UTF-8 room payload exceeding the server limit is rejected before sending", () => {
  const room = { text: "가".repeat(Math.ceil(MAX_SPACE_BYTES / 3)) };
  expect(() => saveGroupSpace(41, { room, expectedRevision: 0 })).toThrow("2MB");
  expect(wire).not.toHaveBeenCalled();
});

test("memory links use ASCII host and encoded path on the wire without changing the draft", async () => {
  const memory = Object.freeze({ id: "photo", kind: "memory", link: "https://한글.example/기록" });
  const room = Object.freeze({ version: 8, items: Object.freeze([memory]) });
  let sentBody;
  wire.mockImplementationOnce(async (request) => {
    sentBody = await request.clone().json();
    return reply({ room: sentBody.room, revision: 1, canEdit: true, updatedAt: "2026-11-09T14:30:00" });
  });
  await saveGroupSpace(41, { room, expectedRevision: 0 });
  expect(sentBody.room.items[0].link).toBe("https://xn--bj0bj06e.example/%EA%B8%B0%EB%A1%9D");
  expect(room.items[0]).toBe(memory);
  expect(memory.link).toBe("https://한글.example/기록");
});

test.each(["javascript:alert(1)", "https://user:secret@example.com/private", "not a url"])(
  "link serialization does not repair an invalid link %s into an accepted one", async (link) => {
    const room = { version: 8, items: [{ kind: "memory", link }] };
    let sentBody;
    wire.mockImplementationOnce(async (request) => {
      sentBody = await request.clone().json();
      return reply(null, 400, "INVALID_GROUP_SPACE");
    });
    await expect(saveGroupSpace(41, { room, expectedRevision: 0 })).rejects.toMatchObject({ status: 400 });
    expect(sentBody.room.items[0].link).toBe(link);
  }
);

test("the public catalog includes retired kinds and rejects duplicate or malformed definitions", async () => {
  const { furnitureCatalog } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  const retired = { ...furnitureCatalog.find(item => item.kind === "bookshelf"), placeable: false };
  const sofa = furnitureCatalog.find(item => item.kind === "sofa");
  const inert = furnitureCatalog.find(item => !item.interaction);
  wire.mockResolvedValueOnce(reply({ interactionCatalogVersion: 1, items: [retired, sofa, inert] }));
  const { interactionCatalogVersion, items } = await fetchFurnitureCatalog();
  expect(interactionCatalogVersion).toBe(1);
  expect(items[0]).toMatchObject({ kind: retired.kind, placeable: false, interaction: { surface: { slots: 4 }, storage: { capacity: 8 } } });
  expect(items[1].interaction).toEqual({ capabilities: ["seatable"], seatCount: 3 });
  expect(items[2]).not.toHaveProperty("interaction");
  expect(wire.mock.calls[0][0].url).toBe("https://app.test/api/group-spaces/furniture-catalog");
  expect(wire.mock.calls[0][0].cache).toBe("no-cache");
  for (const items of [[], [retired, retired], [{ ...retired, surfaces: null }],
    [{ ...sofa, interaction: { ...sofa.interaction, seatCount: 65 } }]]) {
    wire.mockResolvedValueOnce(reply({ interactionCatalogVersion: 1, items }));
    await expect(fetchFurnitureCatalog()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  }
  wire.mockResolvedValueOnce(reply({ items: [inert] }));
  await expect(fetchFurnitureCatalog()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([
  ["wss://realtime.test/ws/realtime", "https://realtime.test/ws/realtime"],
  ["ws://127.0.0.1:8090/ws/realtime", "http://127.0.0.1:8090/ws/realtime"]
])("realtime definitions use ordinary HTTP and omit cookies from %s", async (websocketUrl, expectedUrl) => {
  const { assetDefinitions } = require("../../../tests/fixtures/clubhouse-seeds.cjs");
  const environment = jest.replaceProperty(process, "env", { ...process.env, APP_REALTIME_WEBSOCKET_URL: websocketUrl });
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply({
    capabilities: { ...assetDefinitions.capabilities, assets: { sofa: { capabilities: ["seatable"], seatCount: 3 } } }
  }));
  try {
    const received = await fetchAssetDefinitions();
    expect(received.capabilities.items.camera.camera).toBe(true);
    expect(received.capabilities).not.toHaveProperty("assets");
    expect(Object.keys(received)).toEqual(["capabilities"]);
    const request = fetch.mock.calls[0][0];
    expect(request.url).toBe(expectedUrl);
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("omit");
    expect(request.headers.has("upgrade")).toBe(false);
  } finally {
    fetch.mockRestore();
    environment.restore();
  }
});

test("resaving a stored memory preserves its exact link string", async () => {
  const memory = { id: "memory", kind: "memory", link: "https://Example.com" };
  const room = { items: [memory] };
  let sent;
  wire.mockImplementationOnce(async request => {
    sent = await request.json();
    return reply({ ...emptySpace, room, revision: 2 });
  });
  await saveGroupSpace(41, { room, expectedRevision: 1 }, room);
  expect(sent.room.items).toEqual([memory]);
});
