/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { gameArtwork } from "../../src/pages/games/artworkAssets";

describe.each(["spa-fallback.js", "group-share-preview.js"])("CloudFront %s", (file) => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "../infra/cloudfront", file), "utf8")
    .replace('import cf from "cloudfront";', "var cf = { selectRequestOriginById: function () {} };");
  const context = vm.createContext({}); vm.runInContext(source, context);
  test("rhythm card artwork uses the frontend game asset route and has a bundled file", () => {
    const uri = gameArtwork.rhythm;
    expect(uri).toMatch(/^\/game-assets\//);
    expect(fs.existsSync(path.resolve(process.cwd(), "public", uri.slice(1)))).toBe(true);
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe(uri);
  });
  const arenaFiles = fs.readdirSync(path.resolve(process.cwd(), "public/sparring-arena"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${path.relative(path.resolve(process.cwd(), "public"), path.join(entry.parentPath, entry.name)).split(path.sep).join("/")}`);
  test.each(arenaFiles)("copied arena asset %s keeps its static URL", (uri) => {
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe(uri);
  });
  test.each(["/sw.js", "/manifest.webmanifest", "/icons/pwa-192.png", "/icons/pwa-512.png", "/api/notifications/1/push-content", "/game-assets/rhythm-harpoon/assets/pixel-circuit.ogg", "/game-assets/rhythm-harpoon/assets/chart.json", "/game-assets/rhythm-harpoon/assets/sprites.png"])("%s is not replaced by SPA HTML", (uri) => {
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe(uri);
  });
  test.each(["/", "/home", "/land", "/notifications/open/12", "/games", "/games/rhythm-harpoon", "/games/rhythm-harpoon/single", "/games/rhythm-harpoon/learn", "/games/rhythm-harpoon/practice"])("%s opens the SPA for authentication and internal navigation", (uri) => {
    const result = context.handler({ request: { uri, method: "GET", querystring: {} } });
    expect(result.uri).toBe("/index.html");
  });
});
