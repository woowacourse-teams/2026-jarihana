import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(directory, "../dist");
let removedCount = 0;

async function removeSourceMaps(currentDirectory) {
  let entries;
  try {
    entries = await readdir(currentDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await removeSourceMaps(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".map")) {
        await rm(entryPath);
        removedCount += 1;
      }
    })
  );
}

await removeSourceMaps(outputDirectory);
process.stdout.write(`Removed ${removedCount} source map file(s) from dist.\n`);
