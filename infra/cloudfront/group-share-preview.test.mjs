import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./group-share-preview.js", import.meta.url), "utf8")
  .replace('import cf from "cloudfront";', "");

function route(uri, querystring = {}, { method = "GET", userAgent } = {}) {
  const origins = [];
  const context = vm.createContext({ cf: { selectRequestOriginById: (id) => origins.push(id) } });
  vm.runInContext(source, context);
  const headers = userAgent === undefined ? {} : { "user-agent": { value: userAgent } };
  const request = { uri, method, querystring, headers };
  const result = context.handler({ request });
  assert.equal(result, request);
  return { result, origins };
}

const slackBot = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const previewBots = {
  KakaoTalk: "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984",
  KakaoScrap: "kakaotalk-scrap/1.0",
  Slack: slackBot,
  Facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Facebot: "Facebot",
  X: "Twitterbot/1.0"
};

for (const [path, endpoint] of [["groups", "groups"], ["sparring", "sparrings"]]) {
  for (const [name, userAgent] of Object.entries(previewBots)) {
    test(`${path}: ${name} receives backend metadata including for legacy links`, () => {
      for (const suffix of ["", "/"]) {
        for (const querystring of [{}, { preview: { value: "1" }, promotion_id: { value: "share" } }]) {
          const { result, origins } = route(`/${path}/12${suffix}`, querystring, { userAgent });
          assert.equal(result.uri, `/api/share/${endpoint}/12`);
          assert.equal(Object.keys(result.querystring).length, 0);
          assert.deepEqual(origins, ["jarihana-backend"]);
        }
      }
    });
  }

  test(`${path}: browsers, unknown crawlers and missing User-Agent load SPA directly`, () => {
    for (const userAgent of [undefined, "Mozilla/5.0 KAKAOTALK/26.0", "UnknownPreviewBot/1.0", "Slackbot-LinkExpanding-test/1.0"]) {
      for (const querystring of [{}, { preview: { value: "1" }, promotion_id: { value: "share" } }]) {
        const { result, origins } = route(`/${path}/12`, querystring, { userAgent });
        assert.equal(result.uri, "/index.html");
        assert.equal(Object.keys(result.querystring).length, 0);
        assert.deepEqual(origins, []);
      }
    }
  });

  test(`${path}: invalid topic ids and child routes remain SPA routes`, () => {
    for (const suffix of ["0", "-1", "01", "abc", "12/edit"]) {
      const { result, origins } = route(`/${path}/${suffix}`, {}, { userAgent: slackBot });
      assert.equal(result.uri, "/index.html");
      assert.deepEqual(origins, []);
    }
  });
}

test("API and static files preserve their origin and URI", () => {
  for (const uri of ["/api", "/api/share/sparrings/12", "/api/sparrings/12", "/assets/main.js", "/sparring-arena/assets/entry-rivals.webp"]) {
    const { result, origins } = route(uri, {}, { userAgent: slackBot });
    assert.equal(result.uri, uri);
    assert.deepEqual(origins, []);
  }
});

test("non-GET requests never select the metadata origin", () => {
  for (const method of ["HEAD", "POST", "OPTIONS"]) {
    const { origins } = route("/sparring/12", {}, { method, userAgent: slackBot });
    assert.deepEqual(origins, []);
  }
});
