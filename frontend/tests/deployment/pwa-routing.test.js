/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

describe.each(["spa-fallback.js", "group-share-preview.js"])("CloudFront %s", (file) => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "../infra/cloudfront", file), "utf8")
    .replace('import cf from "cloudfront";', "var cf = { selectRequestOriginById: function () {} };");
  const context = vm.createContext({}); vm.runInContext(source, context);
  const arenaFiles = fs.readdirSync(path.resolve(process.cwd(), "public/sparring-arena"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${path.relative(path.resolve(process.cwd(), "public"), path.join(entry.parentPath, entry.name)).split(path.sep).join("/")}`);
  test.each(arenaFiles)("copied arena asset %s keeps its static URL", (uri) => {
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe(uri);
  });
  test.each(["/sw.js", "/manifest.webmanifest", "/icons/pwa-192.png", "/icons/pwa-512.png", "/api/notifications/1/push-content"])("%s is not replaced by SPA HTML", (uri) => {
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe(uri);
  });
  test.each(["/", "/home", "/land", "/notifications/open/12"])("%s opens the SPA for authentication and internal navigation", (uri) => {
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe("/index.html");
  });
});
