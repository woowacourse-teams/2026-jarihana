import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("../../frontend/dist/", import.meta.url).pathname;
const mimeTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  const relativePath = normalize(pathname).replace(/^\/+/, "");
  let filePath = join(root, relativePath || "index.html");
  try {
    const details = await stat(filePath);
    if (details.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(root, "index.html");
  }
  response.setHeader("Content-Type", mimeTypes.get(extname(filePath)) ?? "application/octet-stream");
  createReadStream(filePath).pipe(response);
}).listen(4174, "127.0.0.1");
