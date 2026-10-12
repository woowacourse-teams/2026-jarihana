const { createReadStream } = require("node:fs");
const { stat } = require("node:fs/promises");
const { createServer, request: proxyRequest } = require("node:http");
const path = require("node:path");

const directory = __dirname;
const distDirectory = path.resolve(directory, "../dist");
const host = "127.0.0.1";
const port = Number(process.env.WEB_PUSH_TEST_PORT ?? 4174);
const apiOrigin = process.env.WEB_PUSH_TEST_API_ORIGIN;
if (apiOrigin && !["127.0.0.1", "localhost"].includes(new URL(apiOrigin).hostname)) {
  throw new Error("Integration preview only proxies a loopback backend.");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

async function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const requestedPath = path.resolve(distDirectory, `.${pathname}`);
  if (!requestedPath.startsWith(`${distDirectory}${path.sep}`) && requestedPath !== distDirectory) {
    return null;
  }

  try {
    const metadata = await stat(requestedPath);
    if (metadata.isFile()) return requestedPath;
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
  }

  return path.extname(pathname) ? null : path.join(distDirectory, "index.html");
}

const server = createServer(async (request, response) => {
  if (apiOrigin && (request.url === "/api" || request.url.startsWith("/api/"))) {
    const target = proxyRequest(new URL(request.url, apiOrigin), {
      method: request.method, headers: { ...request.headers, host: new URL(apiOrigin).host }
    }, (upstream) => {
      response.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(response);
    });
    target.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end("Local backend unavailable"); });
    request.pipe(target);
    return;
  }
  const filePath = await resolveRequestPath(request.url ?? "/");
  if (!filePath) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Production preview listening on http://${host}:${port}\n`);
});
