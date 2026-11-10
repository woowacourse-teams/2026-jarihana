import { readFile } from "node:fs/promises";
import { join } from "node:path";

function silentWav(duration) {
  const sampleRate = 8000;
  const size = Math.round(duration * sampleRate) * 2;
  const data = Buffer.alloc(44 + size);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + size, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(size, 40);
  return data;
}

export async function installGomokuAudioFixture(page) {
  await page.route("https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/*/sounds/gomoku/*.wav", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const body = process.env.GOMOKU_SOUND_DIR
      ? await readFile(join(process.env.GOMOKU_SOUND_DIR, name))
      : silentWav(name.startsWith("stone-") ? 0.24 : 1);
    await route.fulfill({ body, contentType: "audio/wav", headers: { "access-control-allow-origin": "*" } });
  });
}
