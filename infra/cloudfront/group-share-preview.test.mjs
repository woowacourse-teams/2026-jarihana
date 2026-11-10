import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./group-share-preview.js", import.meta.url), "utf8")
  .replace('import cf from "cloudfront";', "");

function route(uri, querystring = {}, method = "GET") {
  const origins = [];
  const context = vm.createContext({ cf: { selectRequestOriginById: (id) => origins.push(id) } });
  vm.runInContext(source, context);
  const request = { uri, method, querystring };
  const result = context.handler({ request });
  assert.equal(result, request);
  return { result, origins };
}

for (const [path, endpoint] of [["groups", "groups"], ["sparring", "sparrings"]]) {
  test(`${path}: rewrites public links to backend metadata and drops queries`, () => {
    for (const suffix of ["", "/"]) {
      const { result, origins } = route(`/${path}/12${suffix}`, {
        promotion_id: { value: "share" }, private: { value: "discard" }
      });
      assert.equal(result.uri, `/api/share/${endpoint}/12`);
      assert.equal(Object.keys(result.querystring).length, 0);
      assert.deepEqual(origins, ["jarihana-backend"]);
    }
  });

  test(`${path}: preview=1 loads SPA and cannot loop through metadata`, () => {
    const { result, origins } = route(`/${path}/12`, {
      preview: { value: "1" }, promotion_id: { value: "share" }
    });
    assert.equal(result.uri, "/index.html");
    assert.equal(Object.keys(result.querystring).length, 0);
    assert.deepEqual(origins, []);
  });

  test(`${path}: invalid or duplicate preview values do not bypass metadata`, () => {
    for (const preview of [{ value: "true" }, { value: "0" }, { value: "1", multiValue: [{ value: "1" }, { value: "0" }] }]) {
      const { result, origins } = route(`/${path}/12`, { preview });
      assert.equal(result.uri, `/api/share/${endpoint}/12`);
      assert.deepEqual(origins, ["jarihana-backend"]);
    }
  });

  test(`${path}: invalid topic ids and child routes remain SPA routes`, () => {
    for (const suffix of ["0", "-1", "01", "abc", "12/edit"]) {
      const { result, origins } = route(`/${path}/${suffix}`);
      assert.equal(result.uri, "/index.html");
      assert.deepEqual(origins, []);
    }
  });
}

test("API and static files preserve their origin and URI", () => {
  for (const uri of ["/api", "/api/share/sparrings/12", "/api/sparrings/12", "/assets/main.js", "/sparring-arena/assets/entry-rivals.webp"]) {
    const { result, origins } = route(uri);
    assert.equal(result.uri, uri);
    assert.deepEqual(origins, []);
  }
});

test("non-GET requests never select the metadata origin", () => {
  for (const method of ["HEAD", "POST", "OPTIONS"]) {
    const { origins } = route("/sparring/12", {}, method);
    assert.deepEqual(origins, []);
  }
});
