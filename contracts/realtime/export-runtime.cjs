// Export the existing scene definitions for the Java server without a second geometry catalog.
const { createRequire } = require("node:module");
const { mkdtemp, readFile, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const frontendRequire = createRequire(path.resolve(__dirname, "../../frontend/package.json"));
const webpack = frontendRequire("webpack");

async function exportRuntime() {
  const directory = await mkdtemp(path.join(tmpdir(), "jarihana-space-runtime-"));
  try {
    await new Promise((resolve, reject) => {
      const compiler = webpack({
        mode: "none", target: "node", entry: path.join(__dirname, "runtime-entry.js"),
        output: { path: directory, filename: "runtime.cjs", library: { type: "commonjs2" } },
        resolve: { extensions: [".js", ".json"], modules: [path.resolve(__dirname, "../../frontend/node_modules")] }
      });
      compiler.run((error, stats) => compiler.close((closeError) => {
        if (error || closeError) reject(error || closeError);
        else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
        else resolve();
      }));
    });
    const { runtime } = require(path.join(directory, "runtime.cjs"));
    const destination = path.join(__dirname, "v1/space-runtime.json");
    const content = JSON.stringify(runtime, null, 2) + "\n";
    if (process.argv.includes("--check")) {
      if (await readFile(destination, "utf8") !== content) throw new Error("space-runtime.json is stale; run node contracts/realtime/export-runtime.cjs");
    } else await writeFile(destination, content);
    process.stdout.write(`Space runtime: ${Object.keys(runtime.assets).length} assets, ${Object.keys(runtime.layouts).length} layouts\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

exportRuntime().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
