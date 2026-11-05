import { createChatActivityReporter } from "./activity";

let focused;
let visibility;
let reporters;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  focused = true;
  visibility = "visible";
  reporters = [];
  jest.spyOn(document, "hasFocus").mockImplementation(() => focused);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  reporters.forEach((reporter) => reporter.stop());
  jest.restoreAllMocks();
  delete document.visibilityState;
  jest.useRealTimers();
});
function setup(connected = true) {
  const report = jest.fn();
  const connection = { current: connected };
  const reporter = createChatActivityReporter({ report, isConnected: () => connection.current });
  reporters.push(reporter);
  return { report, connection, reporter };
}
const dispatch = (type) => window.dispatchEvent(new Event(type));

test("initial entry reports immediately, then every 10 seconds while mouse activity stays local", () => {
  const { report } = setup();
  expect(report).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 99; i += 1) {
    jest.advanceTimersByTime(100);
    dispatch("mousemove");
    dispatch("click");
  }
  expect(report).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(100);
  expect(report).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(10000);
  expect(report).toHaveBeenCalledTimes(3);
});

test.each([[false, "visible"], [true, "hidden"], [false, "hidden"]])("focus %s and visibility %s do not report or accept activity", (focus, state) => {
  focused = focus;
  visibility = state;
  const { report } = setup();
  dispatch("click");
  jest.advanceTimersByTime(300000);
  expect(report).not.toHaveBeenCalled();
  focused = true;
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  expect(report).toHaveBeenCalledTimes(1);
});

test("blur and hidden stop reports; returning starts a fresh activity window immediately", () => {
  const { report } = setup();
  focused = false;
  dispatch("blur");
  jest.advanceTimersByTime(300000);
  expect(report).toHaveBeenCalledTimes(1);
  focused = true;
  dispatch("focus");
  expect(report).toHaveBeenCalledTimes(2);
  visibility = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  jest.advanceTimersByTime(300000);
  expect(report).toHaveBeenCalledTimes(2);
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  expect(report).toHaveBeenCalledTimes(3);
});

test("every report rechecks visibility and focus even without a transition event", () => {
  const { report } = setup();
  focused = false;
  jest.advanceTimersByTime(10000);
  expect(report).toHaveBeenCalledTimes(1);
  focused = true;
  dispatch("click");
  expect(report).toHaveBeenCalledTimes(2);
  visibility = "hidden";
  jest.advanceTimersByTime(10000);
  expect(report).toHaveBeenCalledTimes(2);
});

test.each(["mousemove", "click", "keydown", "scroll", "touchstart", "touchmove"])("five-minute idle expires at the boundary and %s resumes immediately", (event) => {
  const { report } = setup();
  jest.advanceTimersByTime(299999);
  expect(report).toHaveBeenCalledTimes(30);
  jest.advanceTimersByTime(1);
  expect(report).toHaveBeenCalledTimes(30);
  jest.advanceTimersByTime(10000);
  expect(report).toHaveBeenCalledTimes(30);
  dispatch(event);
  expect(report).toHaveBeenCalledTimes(31);
});

test("mouse movement updates local activity at most once per second", () => {
  const { report } = setup();
  dispatch("mousemove");
  jest.advanceTimersByTime(999);
  dispatch("mousemove");
  jest.advanceTimersByTime(299001);
  // The movement at 999 ms did not extend the initial five-minute deadline.
  expect(report).toHaveBeenCalledTimes(30);
  dispatch("mousemove");
  expect(report).toHaveBeenCalledTimes(31);
});

test("reconnect sends only current activity, without renewing idle time or replaying missed reports", () => {
  const { report, reporter, connection } = setup(false);
  jest.advanceTimersByTime(250000);
  expect(report).not.toHaveBeenCalled();
  connection.current = true;
  reporter.connected();
  expect(report).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(49999);
  expect(report).toHaveBeenCalledTimes(5);
  jest.advanceTimersByTime(1);
  reporter.connected();
  expect(report).toHaveBeenCalledTimes(5);
  dispatch("keydown");
  expect(report).toHaveBeenCalledTimes(6);
});

test("pagehide stops reports without an inactive signal and pageshow reports current activity", () => {
  const { report, reporter } = setup();
  dispatch("pagehide");
  jest.advanceTimersByTime(300000);
  reporter.connected();
  expect(report).toHaveBeenCalledTimes(1);
  dispatch("pageshow");
  expect(report).toHaveBeenCalledTimes(2);
});

test("stopping one session does not send an inactive signal or stop another session", () => {
  const first = setup();
  const second = setup();
  first.reporter.stop();
  jest.advanceTimersByTime(10000);
  dispatch("click");
  first.reporter.connected();
  expect(first.report).toHaveBeenCalledTimes(1);
  expect(second.report).toHaveBeenCalledTimes(2);
});

test("a lost publish is not queued or retried before the next report", () => {
  const { report } = setup();
  report.mockImplementationOnce(() => { throw new Error("Disconnected"); });
  expect(() => jest.advanceTimersByTime(10000)).not.toThrow();
  dispatch("click");
  expect(report).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(10000);
  expect(report).toHaveBeenCalledTimes(3);
});

test("activity resumes immediately even when the idle timer was delayed past five minutes", () => {
  const { report } = setup();
  jest.setSystemTime(300000);
  dispatch("click");
  expect(report).toHaveBeenCalledTimes(2);
});
