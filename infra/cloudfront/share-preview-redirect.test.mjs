import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../../backend/src/main/resources/share/share-preview.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

for (const path of ["/groups/12", "/sparring/12"]) {
  for (const [query, expected] of [
    ["", "?preview=1"],
    ["?promotion_id=debate_share-1&private=discard", "?preview=1&promotion_id=debate_share-1"],
    ["?promotion_id=a&promotion_id=b", "?preview=1"],
    ["?promotion_id=%3Cscript%3E", "?preview=1"],
    ["?promotion_id=", "?preview=1"],
    [`?promotion_id=${"a".repeat(81)}`, "?preview=1"],
    ["?preview=0&redirect=https://evil.test/", "?preview=1"]
  ]) {
    test(`${path}: redirect sanitizes ${query || "an empty query"}`, () => {
      let target;
      const canonical = `https://jarihana.example${path}`;
      vm.runInNewContext(script, {
        URL, URLSearchParams,
        document: { querySelector: () => ({ href: canonical }) },
        window: { location: { search: query, replace: (url) => { target = url; } } }
      });
      assert.equal(target, canonical + expected);
    });
  }
}
