import { act, fireEvent, render, within } from "@testing-library/react";

import { LandingTechSection } from "../../../src/pages/landing/LandingTechSection";

let observed;
let originalObserver;

beforeEach(() => {
  observed = new Map();
  originalObserver = global.IntersectionObserver;
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(node) { observed.set(node, this.callback); }
    disconnect() {}
  };
});

afterEach(() => {
  global.IntersectionObserver = originalObserver;
});

const figureOf = (container, id) => container.querySelector(`[data-figure="${id}"]`);
const enter = (node) => act(() => observed.get(node)([{ isIntersecting: true, intersectionRatio: 1 }]));

test("the tech section adds an intro and three chart stops in reading order", () => {
  const { container } = render(<LandingTechSection activeChapter="about" />);
  expect([...container.querySelectorAll("[data-guide-chapter]")].map((node) => node.dataset.guideChapter))
    .toEqual(["tech-intro", "tech-time", "tech-size", "tech-runs"]);
  expect(container.querySelector("#tech-title")).toHaveTextContent("배포 시간을절반 이하로 줄였어요.");
  expect([...container.querySelectorAll(".landing-tech-figure h3")].map((title) => title.textContent)).toEqual([
    "298초에서 135초로, 두 번에 걸쳐 줄였어요",
    "매번 101칸을 올리다가, 이제 한 칸도 채 안 돼요",
    "바꾼 날부터 막대가 짧아졌어요"
  ]);
  for (const id of ["tech-time", "tech-size", "tech-runs"]) {
    expect(figureOf(container, id)).toHaveAttribute("data-state", "idle");
  }
});

test("only the active chart plays and leaving it resets the first frame", () => {
  const { container, rerender } = render(<LandingTechSection activeChapter="tech-time" />);
  expect(container.querySelector('[data-guide-chapter="tech-time"]')).toHaveAttribute("aria-current", "step");
  enter(figureOf(container, "tech-time"));
  expect(figureOf(container, "tech-time")).toHaveAttribute("data-state", "running");
  expect(figureOf(container, "tech-size")).toHaveAttribute("data-state", "idle");

  rerender(<LandingTechSection activeChapter="tech-size" />);
  enter(figureOf(container, "tech-size"));
  expect(figureOf(container, "tech-time")).toHaveAttribute("data-state", "idle");
  expect(figureOf(container, "tech-size")).toHaveAttribute("data-state", "running");
});

test("deploy time lanes keep the measured seconds and explain each change", () => {
  const { container } = render(<LandingTechSection activeChapter="about" />);
  const lanes = [...container.querySelectorAll(".ltc-lane")];
  expect(lanes.map((lane) => lane.querySelector(".ltc-lane__time").textContent)).toEqual(["298초", "265초", "135초"]);
  expect(lanes[0].querySelector('[role="img"]')).toHaveAccessibleName(
    "처음 298초: 배포 중 다시 돌린 테스트 125초, 앱을 이미지로 만들어 올리기 76초, 서버가 켜지길 기다리기 45초, 그 외(준비, 이미지 받기, 교체) 52초"
  );
  expect(lanes[2].querySelector('[role="img"]')).toHaveAccessibleName(/배포 중 다시 돌린 테스트 없음/);
  expect(lanes[1].querySelector(".ltc-lane__note")).toHaveTextContent("이미지 만들어 올리기 76초 → 35초.");
  expect(lanes[2].querySelector(".ltc-lane__note")).toHaveTextContent("배포 중 테스트 136초 → 0초.");
  expect(lanes[2].querySelector(".ltc-seg--test .ltc-seg__to")).toBeNull();
  expect(lanes[2].querySelector(".ltc-seg--image .ltc-seg__from")).toHaveTextContent("35");
  expect(lanes[2].querySelector(".ltc-seg--image .ltc-seg__to")).toHaveTextContent("45");
});

test("image size waffles fill one cell per megabyte", () => {
  const { container } = render(<LandingTechSection activeChapter="about" />);
  const before = container.querySelector(".ltc-waffle--before");
  expect(before.querySelectorAll(".ltc-cell")).toHaveLength(110);
  expect(before.querySelectorAll('.ltc-cell[data-kind="jar"]')).toHaveLength(75);
  expect(before.querySelectorAll('.ltc-cell[data-kind="otel"]')).toHaveLength(23);
  expect(before.querySelectorAll('.ltc-cell[data-kind="packages"]')).toHaveLength(3);
  const after = container.querySelector(".ltc-waffle--after");
  expect(after.querySelectorAll(".ltc-cell[data-kind]")).toHaveLength(1);
  expect(container.querySelector(".ltc-ratio")).toHaveTextContent("약 120분의 1");
});

test("deploy runs chart marks both improvements on the measured runs", () => {
  const { container } = render(<LandingTechSection activeChapter="about" />);
  const cols = [...container.querySelectorAll(".ltc-col")];
  expect(cols.map((col) => col.querySelector(".ltc-col__value").textContent))
    .toEqual(["211", "214", "203", "218", "222", "215", "183", "202", "190", "42", "68"]);
  expect([...container.querySelectorAll(".ltc-col__marker")].map((marker) => marker.textContent))
    .toEqual(["#420 병합", "#429 병합"]);
  expect(cols.filter((col) => col.classList.contains("ltc-col--after"))).toHaveLength(5);
  expect(container.querySelector('[data-guide-chapter="tech-runs"] .landing-tech__source'))
    .toHaveTextContent("GitHub Actions 실측");
});

test("each chart has its own replay action and finishes on its timeline", () => {
  const { container } = render(<LandingTechSection activeChapter="tech-runs" />);
  expect([...container.querySelectorAll(".landing-tech-figure__replay")]
    .map((button) => button.getAttribute("data-ph-capture-attribute-action")))
    .toEqual(["landing_tech_time_replay", "landing_tech_size_replay", "landing_tech_runs_replay"]);
  const runs = figureOf(container, "tech-runs");
  enter(runs);
  expect(runs).toHaveAttribute("data-state", "running");
  fireEvent.animationEnd(runs.querySelector(".landing-tech-figure__timeline"));
  expect(runs).toHaveAttribute("data-state", "complete");
  fireEvent.click(within(runs).getByRole("button", { name: "실제 배포 도표 다시 보기" }));
  expect(runs).toHaveAttribute("data-state", "running");
});
