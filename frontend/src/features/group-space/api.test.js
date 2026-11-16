/** @jest-environment node */
import { apiRequest, createApiClient } from "../../shared/api/index.js";
import { fetchGroupSpace, MAX_SPACE_BYTES, saveGroupSpace } from "./api.js";

jest.mock("../../shared/api/index.js", () => ({
  ...jest.requireActual("../../shared/api/index.js"), apiRequest: jest.fn()
}));

const emptySpace = { room: null, revision: 0, canEdit: true, updatedAt: null };
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

test.each([[409, "GROUP_SPACE_CONFLICT"], [403, "GROUP_SPACE_FORBIDDEN"]])(
  "HTTP %s preserves its code and status without retrying a write", async (status, code) => {
    wire.mockImplementation(() => Promise.resolve(reply(null, status, code)));
    await expect(saveGroupSpace(41, { room: { version: 8 }, expectedRevision: 0 })).rejects.toMatchObject({ status, code });
    expect(wire).toHaveBeenCalledTimes(1);
  }
);

test.each([{ ...emptySpace, revision: -1 }, { ...emptySpace, room: [] },
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
