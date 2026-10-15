import { ImagePlus } from "lucide-react";

import studyImage from "../../shared/assets/landing/default-group-study.webp";
import { useLandingDemo } from "./useLandingDemo";
import { useLandingDemoViewport } from "./useLandingDemoViewport";
import "./landing-create-demo.css";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function LandingCreateDemo({
  isActive = true,
  label = "모임 생성 과정을 보여주는 서비스 화면 예시"
}) {
  const {
    finish,
    paused,
    reducedMotion,
    replay,
    replayKey,
    rootRef,
    state,
    timelineComplete,
    togglePaused
  } = useLandingDemo({ active: isActive });
  useLandingDemoViewport({ rootRef, screen: "create", state, paused, replayKey });

  return (
    <div className="lpc-demo" ref={rootRef}>
      <div className="landing-guide-frame__screen" role="img" aria-label={label}>
        <div
          aria-hidden="true"
          className="landing-product-scene landing-product-scene--create lpc-scene"
          data-paused={paused ? "true" : "false"}
          data-replay={replayKey}
          data-state={state}
          key={replayKey}
        >
          <div className="lpc-timeline-sentinel" onAnimationEnd={finish} />

          <header className="lpc-page-heading">
            <strong>신규 모임 생성</strong>
          </header>

          <section className="lpc-hero" aria-hidden="true">
            <img className="lpc-hero__image" src={studyImage} alt="" width="520" height="320" />
            <div className="lpc-hero__shade" />
            <div className="lpc-image-pill">
              <ImagePlus size={17} />
              <span>대표 이미지</span>
              <strong>추가</strong>
            </div>
            <div className="lpc-hero__copy">
              <span className="lpc-type">스터디</span>
              <strong className="lpc-title">
                <span>함께 배우는 토요일</span>
              </strong>
              <span className="lpc-intro">
                <span>같은 목표, 서로 다른 생각.</span>
              </span>
            </div>
            <strong className="lpc-info-heading">모임 정보</strong>
            <dl className="lpc-facts">
              <div>
                <dt>모임 방식</dt>
                <dd>오프라인</dd>
              </div>
              <div className="lpc-schedule-fact">
                <dt>모임 일정</dt>
                <dd>
                  <span>매주 토요일<br />14:00–16:00</span>
                  <em>설정</em>
                </dd>
              </div>
              <div>
                <dt>장소</dt>
                <dd>잠실 캠퍼스</dd>
              </div>
            </dl>
          </section>

          <div className="lpc-schedule-dialog">
            <div className="lpc-dialog-card">
              <span className="lpc-dialog-eyebrow">활동 일정</span>
              <strong>매주 반복되는 요일과 시간을 정합니다.</strong>
              <div className="lpc-day-grid">
                {DAYS.map((day) => (
                  <span className={day === "토" ? "is-selected" : ""} key={day}>
                    {day}
                  </span>
                ))}
              </div>
              <div className="lpc-time-grid">
                <span>
                  시작 시간 <strong>14:00</strong>
                </span>
                <span>
                  종료 시간 <strong>16:00</strong>
                </span>
              </div>
              <span className="lpc-dialog-action">일정 저장</span>
            </div>
          </div>

          <section className="lpc-editor">
            <div className="lpc-tabs">
              <span className="is-selected">소개</span>
              <span>참여자</span>
            </div>
            <div className="lpc-description-panel">
              <div className="lpc-description-heading">
                <div>
                  <strong>모임 소개</strong>
                </div>
                <div>
                  <span className="is-selected">작성</span>
                  <span>미리보기</span>
                </div>
              </div>
              <div className="lpc-toolbar">
                <span>H2</span>
                <span>B</span>
                <span>I</span>
                <span>목록</span>
                <span>링크</span>
                <span className="lpc-count">84 / 10,000</span>
              </div>
              <div className="lpc-textarea">
                <p>
                  <span>매주 토요일, 각자 공부한 내용을 짧게 나누고</span>
                  <span>막히는 부분은 함께 풀어봐요.</span>
                  <span>질문이 많은 사람도 편하게 함께할 수 있어요.</span>
                </p>
              </div>
            </div>
            <div className="lpc-actions">
              <span>취소</span>
              <strong>모임 만들기</strong>
            </div>
          </section>
        </div>
      </div>

      <div className="lpc-controls" aria-label="모임 생성 화면 데모 제어">
        <button
          data-ph-capture-attribute-action="landing_create_demo_pause_toggle"
          disabled={timelineComplete}
          onClick={togglePaused}
          type="button"
        >
          {paused ? "재생" : "일시정지"}
        </button>
        <button
          data-ph-capture-attribute-action="landing_create_demo_replay"
          disabled={reducedMotion}
          onClick={replay}
          type="button"
        >
          다시보기
        </button>
        <span className="lpc-progress" aria-hidden="true">
          <span data-paused={paused ? "true" : "false"} data-state={state} key={replayKey} />
        </span>
      </div>
    </div>
  );
}
