import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as proxyRequest } from "node:http";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoAccounts } from "./demo-accounts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "frontend/dist");
const port = Number(process.env.CHAT_UI_PORT ?? 5176);
const backendPort = Number(process.env.CHAT_BACKEND_PORT ?? 8095);
const handleDemo = createDemoAccounts({ enabled: process.env.CHAT_DEMO_ENABLED === "true", secret: process.env.ACCESS_TOKEN_SECRET, databaseUrl: process.env.DB_URL, port });
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  if (req.url.startsWith("/_preview/")) {
    try {
      if (handleDemo) await handleDemo(req, res);
      else res.writeHead(404).end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end("Local login unavailable"); }
    return;
  }
  if (req.url.startsWith("/api/")) {
    const upstream = proxyRequest({ host: "127.0.0.1", port: backendPort, path: req.url, method: req.method, headers: req.headers }, (result) => {
      res.writeHead(result.statusCode, result.headers);
      result.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("Local backend unavailable"); });
    req.pipe(upstream);
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    let file = path.resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(`${dist}${path.sep}`)) { res.writeHead(403).end(); return; }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (path.extname(pathname)) { res.writeHead(404).end(); return; }
      file = path.join(dist, "index.html");
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(400).end(); }
});

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/api/ws/chat") { socket.destroy(); return; }
  const upstream = connect(backendPort, "127.0.0.1", () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) upstream.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    upstream.write("\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
});

server.listen(port, "127.0.0.1", () => console.log(`Chat UI http://127.0.0.1:${port}; backend ${backendPort}`));
