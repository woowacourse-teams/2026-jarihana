import { useLandingDemo } from "./useLandingDemo";
import { useLandingDemoViewport } from "./useLandingDemoViewport";
import "./landing-product-demo.css";

const demoDurations = {
  browse: "5.5s",
  detail: "6.5s",
  continue: "5.5s",
  proposal: "6.5s",
  manage: "6s",
  invite: "6.5s",
  chat: "7.5s",
  calendar: "6s",
  activity: "12s"
};

const demoLabels = {
  browse: "모임 둘러보기 화면 데모 제어",
  detail: "모임 상세 화면 데모 제어",
  continue: "마이페이지 화면 데모 제어",
  proposal: "자유게시판 화면 데모 제어",
  manage: "신청 관리 화면 데모 제어",
  invite: "초대하기 화면 데모 제어",
  chat: "채팅 화면 데모 제어",
  calendar: "모임 캘린더 화면 데모 제어",
  activity: "활동 피드 화면 데모 제어"
};

const analyticsActions = {
  browse: {
    pause: "landing_browse_demo_pause_toggle",
    replay: "landing_browse_demo_replay"
  },
  detail: {
    pause: "landing_detail_demo_pause_toggle",
    replay: "landing_detail_demo_replay"
  },
  continue: {
    pause: "landing_continue_demo_pause_toggle",
    replay: "landing_continue_demo_replay"
  },
  proposal: {
    pause: "landing_proposal_demo_pause_toggle",
    replay: "landing_proposal_demo_replay"
  },
  manage: {
    pause: "landing_manage_demo_pause_toggle",
    replay: "landing_manage_demo_replay"
  },
  invite: {
    pause: "landing_invite_demo_pause_toggle",
    replay: "landing_invite_demo_replay"
  },
  chat: {
    pause: "landing_chat_demo_pause_toggle",
    replay: "landing_chat_demo_replay"
  },
  calendar: {
    pause: "landing_calendar_demo_pause_toggle",
    replay: "landing_calendar_demo_replay"
  },
  activity: {
    pause: "landing_activity_demo_pause_toggle",
    replay: "landing_activity_demo_replay"
  }
};

export function LandingProductDemo({ children, isActive = true, label, screen }) {
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
  useLandingDemoViewport({ rootRef, screen, state, paused, replayKey });
  const actions = analyticsActions[screen] ?? analyticsActions.browse;
  const duration = demoDurations[screen] ?? demoDurations.browse;

  return (
    <div
      className="landing-product-demo"
      data-demo={screen}
      data-paused={paused ? "true" : "false"}
      data-replay={replayKey}
      data-state={state}
      ref={rootRef}
      style={{ "--demo-duration": duration }}
    >
      <div
        className="landing-guide-frame__screen landing-product-demo__screen"
        key={replayKey}
        role="img"
        aria-label={label}
      >
        <div className="landing-product-demo__timeline" onAnimationEnd={finish} />
        {children}
      </div>

      <div
        className="landing-product-demo__controls"
        aria-label={demoLabels[screen] ?? "서비스 화면 데모 제어"}
      >
        <button
          data-ph-capture-attribute-action={actions.pause}
          disabled={timelineComplete}
          onClick={togglePaused}
          type="button"
        >
          {paused ? "재생" : "일시정지"}
        </button>
        <button
          data-ph-capture-attribute-action={actions.replay}
          disabled={reducedMotion}
          onClick={replay}
          type="button"
        >
          다시보기
        </button>
        <span className="landing-product-demo__progress" aria-hidden="true">
          <span data-paused={paused ? "true" : "false"} data-state={state} key={replayKey} />
        </span>
      </div>
    </div>
  );
}
