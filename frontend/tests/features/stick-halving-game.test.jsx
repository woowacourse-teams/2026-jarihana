import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { StickHalvingGame } from "../../src/features/stick-halving";
import { generatePracticeStick } from "../../src/features/stick-halving/puzzle";

const firstStick = generatePracticeStick(11, 1);
const secondStick = generatePracticeStick(11, 2);

const timerShows = (text) => waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent(text));

function rankedAdapter(nextRemainingMillis) {
  return {
    cut: jest.fn().mockResolvedValue({
      answerPosition: 6,
      errorRate: 0.01,
      finished: false,
      round: 1,
      score: 900,
      timedOut: false,
      totalScore: 900
    }),
    next: jest.fn().mockResolvedValue({ remainingMillis: nextRemainingMillis, round: 2, stick: secondStick }),
    start: jest.fn().mockResolvedValue({ remainingMillis: 30_000, round: 1, stick: firstStick })
  };
}

async function cutFirstStickAndWaitOnResult(adapter, waitMillis) {
  render(<StickHalvingGame adapter={adapter} />);
  await timerShows("30초 남음");
  fireEvent.click(screen.getByRole("button", { name: "자르기" }));
  const nextButton = await screen.findByRole("button", { name: "다음 막대" });
  await act(async () => {
    jest.advanceTimersByTime(waitMillis);
  });
  return nextButton;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it("asks for the next stick only after the result screen and counts from the moment it arrives", async () => {
  // Given: 결과 화면을 10초 동안 본다.
  const adapter = rankedAdapter(30_000);
  const nextButton = await cutFirstStickAndWaitOnResult(adapter, 10_000);
  expect(adapter.next).not.toHaveBeenCalled();

  // When
  fireEvent.click(nextButton);

  // Then: 기다린 시간이 다음 막대의 제한 시간에서 빠지지 않는다.
  await timerShows("30초 남음");
  expect(adapter.next).toHaveBeenCalledWith(2);
  expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^2\/5/);
});

it("shows the time left until the server deadline instead of a fresh 30 seconds", async () => {
  // Given: 응답이 늦게 와서 서버 마감까지 12초만 남았다.
  const adapter = rankedAdapter(12_000);
  const nextButton = await cutFirstStickAndWaitOnResult(adapter, 1_000);

  // When
  fireEvent.click(nextButton);

  // Then
  await timerShows("12초 남음");
  expect(screen.getByRole("timer")).not.toHaveTextContent("30초 남음");
});

it("counts the time the response spent on the way, so the screen never shows more than the server allows", async () => {
  // Given: 다음 막대 응답이 5초 늦게 온다. 서버는 요청을 받은 때부터 30초를 잰다.
  const adapter = rankedAdapter(30_000);
  adapter.next.mockImplementation(
    () => new Promise((resolve) => {
      setTimeout(() => resolve({ remainingMillis: 30_000, round: 2, stick: secondStick }), 5_000);
    })
  );
  const nextButton = await cutFirstStickAndWaitOnResult(adapter, 1_000);

  // When
  fireEvent.click(nextButton);
  await act(async () => {
    jest.advanceTimersByTime(5_000);
  });

  // Then: 응답을 기다린 5초가 빠진 25초만 보여 준다.
  await timerShows("25초 남음");
  expect(screen.getByRole("timer")).not.toHaveTextContent("30초 남음");
});

it("counts the first stick from when the run was requested too", async () => {
  // Given: 판 시작 응답이 4초 늦게 온다.
  const adapter = rankedAdapter(30_000);
  adapter.start.mockImplementation(
    () => new Promise((resolve) => {
      setTimeout(() => resolve({ remainingMillis: 30_000, round: 1, stick: firstStick }), 4_000);
    })
  );

  // When
  render(<StickHalvingGame adapter={adapter} />);
  await act(async () => {
    jest.advanceTimersByTime(4_000);
  });

  // Then
  await timerShows("26초 남음");
});

it("brings the game area back into view when the next stick starts, instead of leaving the page at the ranking below", async () => {
  // Given
  const scrollIntoView = jest.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const adapter = rankedAdapter(30_000);
  const nextButton = await cutFirstStickAndWaitOnResult(adapter, 0);
  expect(scrollIntoView).not.toHaveBeenCalled();

  // When
  fireEvent.click(nextButton);
  expect(await screen.findByRole("button", { name: "자르기" })).toBeInTheDocument();

  // Then
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("region", { name: "게임" }));
  expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  delete Element.prototype.scrollIntoView;
});
