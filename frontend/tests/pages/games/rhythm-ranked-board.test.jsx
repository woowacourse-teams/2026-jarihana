import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useState } from "react";

import { rhythmRankedApi } from "../../../src/features/game/rhythm/rankedApi.js";
import { RhythmRankedBoard } from "../../../src/features/game/rhythm/RhythmRankedBoard.jsx";
import { DEFAULT_KEYMAP } from "../../../src/features/game/rhythm/preferences.mjs";

// 소리와 그림은 jsdom에서 돌릴 수 없으므로 바꿔 두고, 판의 상태 전이와 서버 알림만 본다.
jest.mock("../../../src/features/game/rhythm/audio.mjs", () => ({
  MusicTransport: class {
    constructor() {
      this.gain = { gain: { value: 1 } };
    }
    async start() {}
    stop() {}
    countIn() {}
    schedule() {}
    timeAt() {
      return 0;
    }
  }
}));
jest.mock("../../../src/features/game/rhythm/render.mjs", () => ({
  Renderer: class {
    receive() {}
    draw() {}
  },
  loopHealAnnouncement: () => ""
}));
jest.mock("../../../src/features/game/rhythm/rankedApi.js", () => ({
  rhythmRankedApi: { start: jest.fn(), submit: jest.fn(), abandon: jest.fn() }
}));

const chart = JSON.parse(
  readFileSync(`${__dirname}/../../../public/game-assets/rhythm-harpoon/assets/chart.json`, "utf8")
);
const session = {
  challengeId: 31,
  level: "easy",
  scrollSpeed: 1,
  seed: 987654,
  rulesVersion: "rhythm-harpoon-ranked-4",
  chartVersion: chart.chartVersion
};
const settings = { keymap: DEFAULT_KEYMAP, offset: 0, volume: 50, timingFeedback: true, labels: true };

// 공식 도전 화면처럼 판이 끝났다는 알림을 받으면 판을 내리고 그 사유를 보여 준다.
function Page({ onError, onInvalid }) {
  const [ended, setEnded] = useState(null);
  if (ended) return <p role="status">{ended}</p>;
  return (
    <RhythmRankedBoard
      onError={(error) => {
        onError(error);
        setEnded("error " + error.status);
      }}
      onFinished={() => setEnded("finished")}
      onInvalid={(reason) => {
        onInvalid(reason);
        setEnded("invalid " + reason);
      }}
      session={session}
      settings={settings}
    />
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  rhythmRankedApi.start.mockResolvedValue({ status: "PLAYING" });
  rhythmRankedApi.abandon.mockResolvedValue({ status: "INVALID", invalidReason: "ABANDONED" });
  global.fetch = jest.fn(async (url) =>
    String(url).includes("chart")
      ? { ok: true, json: async () => chart }
      : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
  );
  global.Image = class {
    set src(value) {
      queueMicrotask(() => this.onload());
    }
  };
  global.AudioContext = class {
    state = "running";
    async decodeAudioData() {
      return { duration: chart.durationSeconds };
    }
    async close() {}
  };
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function startRun() {
  const onError = jest.fn();
  const onInvalid = jest.fn();
  render(<Page onError={onError} onInvalid={onInvalid} />);
  // 음악을 불러오는 동안은 "음악 준비 중"이고, 준비되면 "시작"이 된다.
  const start = await screen.findByRole("button", { name: "시작" });
  expect(start).toBeEnabled();
  await act(async () => {
    fireEvent.click(start);
  });
  return { onError, onInvalid };
}

it("shows the server rejection instead of calling it an abandoned run", async () => {
  rhythmRankedApi.submit.mockRejectedValue(Object.assign(new Error("거절"), { status: 400 }));
  const { onError, onInvalid } = await startRun();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onInvalid).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("error 400");
  // 기록되지 않는 판이므로 서버에는 한 번만 끝났다고 알린다.
  expect(rhythmRankedApi.abandon).toHaveBeenCalledTimes(1);
});

it("keeps the reason the server gave when it invalidated the run", async () => {
  rhythmRankedApi.submit.mockResolvedValue({ status: "INVALID", invalidReason: "LAGGED" });
  const { onError, onInvalid } = await startRun();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  expect(onInvalid).toHaveBeenCalledTimes(1);
  expect(onInvalid).toHaveBeenCalledWith("LAGGED");
  expect(onError).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("invalid LAGGED");
  expect(rhythmRankedApi.abandon).not.toHaveBeenCalled();
});

it("keeps EXPIRED when the challenge ran out before it started", async () => {
  rhythmRankedApi.start.mockResolvedValue({ status: "INVALID", invalidReason: "EXPIRED" });
  const { onInvalid } = await startRun();
  expect(onInvalid).toHaveBeenCalledTimes(1);
  expect(onInvalid).toHaveBeenCalledWith("EXPIRED");
  expect(screen.getByRole("status")).toHaveTextContent("invalid EXPIRED");
  expect(rhythmRankedApi.abandon).not.toHaveBeenCalled();
});

it("still reports leaving with Esc as an abandoned run once", async () => {
  const { onInvalid } = await startRun();
  act(() => {
    fireEvent.keyDown(window, { key: "Escape" });
  });
  expect(onInvalid).toHaveBeenCalledTimes(1);
  expect(onInvalid).toHaveBeenCalledWith("ABANDONED");
  expect(rhythmRankedApi.abandon).toHaveBeenCalledTimes(1);
});
