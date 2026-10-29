import { RotateCcw } from "lucide-react";

import { useLandingDemo } from "./useLandingDemo";
import "./landing-tech.css";

// 수치 출처: 백엔드 이미지 빌드와 전달 개선 리포트(PR #420, #424, #429), GitHub Actions develop 배포 실측
const SCALE_SECONDS = 300;
const SEGMENTS = [
  { key: "test", label: "배포 중 다시 돌린 테스트" },
  { key: "image", label: "앱을 이미지로 만들어 올리기" },
  { key: "ready", label: "서버가 켜지길 기다리기" },
  { key: "etc", label: "그 외(준비, 이미지 받기, 교체)" }
];
const BEFORE = { test: 125, image: 76, ready: 45, etc: 52 };
const AFTER_IMAGE = { test: 136, image: 35, ready: 42, etc: 52 };
const NOW = { test: 0, image: 45, ready: 41, etc: 49 };

const lanes = [
  { id: "before", name: "처음", seconds: 298, meta: "#420 전 배포 6회 평균", values: BEFORE },
  {
    id: "image",
    name: "이미지 개선 후",
    seconds: 265,
    delta: "33초 줄었어요",
    meta: "#420, #424 이후 배포 3회 평균",
    from: BEFORE,
    values: AFTER_IMAGE,
    noteAt: "51.2%",
    noteTitle: "이미지 만들어 올리기 76초 → 35초.",
    note: "테스트에서 이미 컴파일한 코드를 Docker 안에서 다시 빌드하지 않고, 바뀐 계층만 올려요."
  },
  {
    id: "now",
    name: "지금",
    seconds: 135,
    delta: "163초, 55% 줄었어요",
    meta: "#429 이후 #442 배포",
    from: AFTER_IMAGE,
    values: NOW,
    noteAt: "1.5%",
    noteTitle: "배포 중 테스트 136초 → 0초.",
    note: "PR에서 이미 통과한 테스트를 배포 때 다시 돌리지 않아요. 이미지 단계는 컴파일을 맡아 10초 늘었어요."
  }
];

// 칸 하나가 1 MB다. 앱 코드만 바뀐 빌드에서 GHCR에 새로 올라간 계층 크기
const WAFFLE_CELLS = 110;
const beforeLayers = [
  { kind: "jar", label: "의존성과 앱 코드(한 덩어리)", size: "75.4 MB", cells: 75 },
  { kind: "otel", label: "관측 도구(OTel agent)", size: "22.6 MB", cells: 23 },
  { kind: "packages", label: "패키지 설치와 사용자 생성", size: "3.1 MB", cells: 3 }
];

// 실제 배포 11번: 날짜(10월), 병합 PR, 빌드 단계 전체 시간, 그중 배포 중 테스트 시간(초)
const RUNS_MAX_SECONDS = 270;
const runs = [
  { day: "14", total: 211, test: 120 },
  { day: "15", total: 214, test: 117 },
  { day: "15", total: 203, test: 116 },
  { day: "15", total: 218, test: 131 },
  { day: "16", total: 222, test: 130 },
  { day: "19", total: 215, test: 133 },
  { day: "19", pr: "#420", total: 183, test: 125, marker: "#420 병합" },
  { day: "19", pr: "#405", total: 202, test: 146 },
  { day: "20", pr: "#440", total: 190, test: 138 },
  { day: "22", pr: "#429", total: 42, test: 0, marker: "#429 병합", markerAlign: "start" },
  { day: "22", pr: "#442", total: 68, test: 0 }
];
const FIRST_IMPROVED_RUN = 6;

const percent = (seconds) => `${(seconds / SCALE_SECONDS) * 100}%`;
const isNarrow = (seconds) => seconds / SCALE_SECONDS < 0.07;

function laneLabel(lane) {
  const parts = SEGMENTS.map(({ key, label }) => {
    const seconds = lane.values[key];
    return seconds ? `${label} ${seconds}초` : `${label} 없음`;
  });
  return `${lane.name} ${lane.seconds}초: ${parts.join(", ")}`;
}

function TechFigure({ active, after, children, footer, id, kicker, replayAction, replayLabel, sub, title }) {
  const { finish, paused, reducedMotion, replay, replayKey, rootRef, state } = useLandingDemo({ active });
  return (
    <div
      aria-current={active ? "step" : undefined}
      className="landing-tech__chapter"
      data-guide-chapter={id}
    >
      <figure
        aria-labelledby={`${id}-title`}
        className="landing-container landing-tech-figure"
        data-figure={id}
        data-paused={paused ? "true" : "false"}
        data-state={state}
        ref={rootRef}
      >
        <div className="landing-tech-figure__head">
          <div className="landing-tech-figure__titles">
            <p className="landing-tech-figure__kicker">{kicker}</p>
            <h3 id={`${id}-title`}>{title}</h3>
            <p className="landing-tech-figure__sub">{sub}</p>
          </div>
          <button
            aria-label={replayLabel}
            className="landing-tech-figure__replay"
            data-ph-capture-attribute-action={replayAction}
            disabled={reducedMotion}
            onClick={replay}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="landing-tech-figure__body" key={replayKey}>
          <span aria-hidden="true" className="landing-tech-figure__timeline" onAnimationEnd={finish} />
          {children}
        </div>
        {footer}
      </figure>
      {after}
    </div>
  );
}

function SegmentValue({ from, to }) {
  return (
    <span className="ltc-seg__values">
      {from === undefined || isNarrow(from) ? null : <span className="ltc-seg__from">{from}</span>}
      {isNarrow(to) ? null : <span className="ltc-seg__to">{to}</span>}
    </span>
  );
}

function DeployTimeFigure({ active }) {
  return (
    <TechFigure
      active={active}
      footer={
        <ul className="ltc-legend">
          {SEGMENTS.map(({ key, label }) => (
            <li key={key}><span className={`ltc-swatch ltc-swatch--${key}`} />{label}</li>
          ))}
        </ul>
      }
      id="tech-time"
      kicker="배포 한 번에 걸리는 시간"
      replayAction="landing_tech_time_replay"
      replayLabel="배포 시간 도표 다시 보기"
      sub="develop에 병합한 뒤 빌드와 배포가 끝나기까지(runner 대기 제외)"
      title="298초에서 135초로, 두 번에 걸쳐 줄였어요"
    >
      <div className="ltc-lanes">
        {lanes.map((lane) => (
          <div className={`ltc-lane ltc-lane--${lane.id}`} key={lane.id}>
            <div className="ltc-lane__label">
              <span className="ltc-lane__name">{lane.name}</span>
              <span className="ltc-lane__time">{lane.seconds}<small>초</small></span>
              {lane.delta ? <span className="ltc-lane__delta">{lane.delta}</span> : null}
              <span className="ltc-lane__meta">{lane.meta}</span>
            </div>
            <div className="ltc-lane__body">
              <div className="ltc-lane__track">
                {lane.from ? <div aria-hidden="true" className="ltc-lane__ghost" /> : null}
                <div aria-label={laneLabel(lane)} className="ltc-lane__bar" role="img">
                  {SEGMENTS.map(({ key }, index) => (
                    <span
                      className={`ltc-seg ltc-seg--${key}`}
                      key={key}
                      style={{
                        "--from": lane.from ? percent(lane.from[key]) : "0%",
                        "--i": index,
                        "--to": percent(lane.values[key])
                      }}
                    >
                      <SegmentValue from={lane.from?.[key]} to={lane.values[key]} />
                    </span>
                  ))}
                </div>
              </div>
              {lane.note ? (
                <p className="ltc-lane__note" style={{ "--at": lane.noteAt }}>
                  <strong>{lane.noteTitle}</strong> {lane.note}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </TechFigure>
  );
}

function Waffle({ fill, label }) {
  return (
    <div aria-label={label} className="ltc-waffle__grid" role="img">
      {Array.from({ length: WAFFLE_CELLS }, (_, index) => {
        const kind = fill(index);
        return (
          <span
            className="ltc-cell"
            data-kind={kind ?? undefined}
            key={index}
            style={kind ? { "--i": index } : undefined}
          />
        );
      })}
    </div>
  );
}

function beforeKind(index) {
  let start = 0;
  for (const layer of beforeLayers) {
    if (index < start + layer.cells) return layer.kind;
    start += layer.cells;
  }
  return null;
}

function ImageSizeFigure({ active }) {
  return (
    <TechFigure
      active={active}
      footer={
        <div className="ltc-why">
          <p>
            <strong>왜 매번 다 올렸나요?</strong>
            빌드할 때마다 새 컴퓨터에서 시작해서, 내용이 같은 부분도 처음 만든 것으로 여겨 다시 올렸어요. 의존성과 앱 코드도 한 덩어리라 코드 한 줄만 바뀌어도 75 MB를 통째로 올렸어요.
          </p>
          <p>
            <strong>어떻게 줄였나요?</strong>
            의존성과 앱 코드를 나눠 담고 이미지에 이전 빌드 정보를 함께 남겨요. 그래서 내용이 같은 부분은 다시 만들지도, 다시 받지도 않아요.
          </p>
        </div>
      }
      id="tech-size"
      kicker="앱 코드만 바뀐 빌드에서 새로 올리는 양"
      replayAction="landing_tech_size_replay"
      replayLabel="이미지 크기 도표 다시 보기"
      sub="한 칸이 1 MB예요."
      title="매번 101칸을 올리다가, 이제 한 칸도 채 안 돼요"
    >
      <div className="ltc-waffles">
        <div className="ltc-waffle ltc-waffle--before">
          <p className="ltc-waffle__head"><span>처음</span><strong>101.1<small>MB</small></strong></p>
          <Waffle
            fill={beforeKind}
            label="110칸 중 101칸이 채워진 그림: 의존성과 앱 코드 75.4 MB, 관측 도구 22.6 MB, 패키지 설치와 사용자 생성 3.1 MB"
          />
          <ul className="ltc-waffle__legend">
            {beforeLayers.map((layer) => (
              <li key={layer.kind}>
                <span className={`ltc-swatch ltc-swatch--${layer.kind}`} />
                <span className="ltc-waffle__label">{layer.label}<b>{layer.size}</b></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="ltc-ratio">
          <svg aria-hidden="true" className="ltc-ratio__arrow" fill="none" viewBox="0 0 56 24">
            <path d="M4 12h46" />
            <path d="m40 4 10 8-10 8" />
          </svg>
          <strong>약 120분의 1</strong>
          <span>서버가 받는 시간 11초 → 3초</span>
        </div>
        <div className="ltc-waffle ltc-waffle--after">
          <p className="ltc-waffle__head"><span>지금</span><strong>0.84<small>MB</small></strong></p>
          <Waffle fill={(index) => (index === 0 ? "app" : null)} label="110칸 중 한 칸의 84%만 채워진 그림: 앱 코드 0.84 MB" />
          <ul className="ltc-waffle__legend">
            <li>
              <span className="ltc-swatch ltc-swatch--image" />
              <span className="ltc-waffle__label">바뀐 앱 코드만<b>0.84 MB</b></span>
            </li>
            <li>
              <span className="ltc-swatch ltc-swatch--etc" />
              <span className="ltc-waffle__label">의존성, 관측 도구, 패키지는 이미 있는 것을 그대로 써요</span>
            </li>
          </ul>
        </div>
      </div>
    </TechFigure>
  );
}

function runTitle(run) {
  const merged = run.pr ? `, ${run.pr} 병합 배포` : "";
  const test = run.test ? `(배포 중 테스트 ${run.test}초)` : ", 배포 중 테스트 없음";
  return `10월 ${run.day}일${merged}: 빌드 단계 ${run.total}초${test}`;
}

function DeployRunsFigure({ active }) {
  return (
    <TechFigure
      active={active}
      after={
        <p className="landing-container landing-tech__source">
          GitHub Actions 실측, develop 백엔드 배포 기준(2026-10-14~10-22). 배포 시간은 빌드와 배포 단계를 더한 값이고 runner 대기는 뺐어요. 이미지 크기는 앱 코드만 바뀐 빌드에서 GHCR에 새로 올라간 계층 기준이에요. 의존성이나 베이스 이미지가 바뀐 빌드는 바뀐 계층을 다시 올려요.
        </p>
      }
      footer={
        <>
          <ul className="ltc-legend">
            <li><span className="ltc-swatch ltc-swatch--test" />배포 중 다시 돌린 테스트</li>
            <li><span className="ltc-swatch ltc-swatch--ready" />그 외 빌드(바꾸기 전)</li>
            <li><span className="ltc-swatch ltc-swatch--image" />그 외 빌드(바꾼 뒤)</li>
          </ul>
          <p className="ltc-foot">
            #429 배포(42초)는 백엔드 코드를 바꾸지 않아 짧게 나왔어요. 백엔드 코드가 바뀐 #442 배포(68초)를 대표값으로 봐요.
          </p>
        </>
      }
      id="tech-runs"
      kicker="실제 배포 11번의 빌드 단계 시간"
      replayAction="landing_tech_runs_replay"
      replayLabel="실제 배포 도표 다시 보기"
      sub="막대 위 숫자는 빌드 단계 전체 시간(초)이고 점선은 개선 PR을 병합한 때예요."
      title="바꾼 날부터 막대가 짧아졌어요"
    >
      <div className="ltc-runs">
        <div className="ltc-runs__plot">
          <div aria-hidden="true" className="ltc-runs__grid">
            {[0, 60, 120, 180, 240].map((seconds) => (
              <span data-label={seconds} key={seconds} style={{ "--y": `${(seconds / RUNS_MAX_SECONDS) * 100}%` }} />
            ))}
          </div>
          <div
            aria-label="10월 14일부터 22일까지 배포 11번의 빌드 단계 시간. #420 병합 전 6번은 203초에서 222초, 이후 3번은 183초에서 202초, #429 병합 뒤 2번은 42초와 68초예요."
            className="ltc-runs__cols"
            role="img"
          >
            {runs.map((run, index) => {
              const rest = ((run.total - run.test) / run.total) * 100;
              return (
                <div
                  className={`ltc-col${index >= FIRST_IMPROVED_RUN ? " ltc-col--after" : ""}`}
                  data-marker={run.marker ? "" : undefined}
                  key={`${run.day}-${run.total}`}
                  style={{ "--i": index }}
                  title={runTitle(run)}
                >
                  {run.marker ? (
                    <span className={`ltc-col__marker${run.markerAlign === "start" ? " ltc-col__marker--start" : ""}`}>
                      {run.marker}
                    </span>
                  ) : null}
                  <span className="ltc-col__value">{run.total}</span>
                  <span className="ltc-col__stack" style={{ "--h": `${(run.total / RUNS_MAX_SECONDS) * 100}%` }}>
                    <span className="ltc-col__rest" style={{ height: `${rest}%` }} />
                    <span className="ltc-col__test" style={{ height: `${100 - rest}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div aria-hidden="true" className="ltc-runs__x">
          {runs.map((run) => (
            <span key={`${run.day}-${run.total}`}>
              {run.day}
              {run.pr ? <small className={run.marker ? "ltc-runs__pr--key" : "ltc-runs__pr--minor"}>{run.pr}</small> : null}
            </span>
          ))}
        </div>
      </div>
    </TechFigure>
  );
}

export function LandingTechSection({ activeChapter }) {
  return (
    <section aria-labelledby="tech-title" className="landing-tech" id="tech">
      <div className="landing-container">
        <div
          aria-current={activeChapter === "tech-intro" ? "step" : undefined}
          className="landing-guide__intro landing-tech__intro"
          data-guide-chapter="tech-intro"
        >
          <p className="landing-eyebrow">자리하나를 만드는 방식</p>
          <h2 id="tech-title">배포 시간을<br />절반 이하로 줄였어요.</h2>
          <p>
            같은 일을 두 번 하던 단계를 덜어 냈어요.
            <br />테스트는 한 번만 돌리고 서버에는 바뀐 부분만 보내요.
          </p>
        </div>
      </div>
      <DeployTimeFigure active={activeChapter === "tech-time"} />
      <ImageSizeFigure active={activeChapter === "tech-size"} />
      <DeployRunsFigure active={activeChapter === "tech-runs"} />
    </section>
  );
}
