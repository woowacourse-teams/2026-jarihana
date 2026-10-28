import { ArrowRight, CalendarDays, Camera, CheckCircle2, ClipboardCheck, Hand, Plus, Search, UserPlus } from "lucide-react";
import { Link } from "react-router";

import { LandingProductScene } from "./LandingProductScene";
import { LandingCreateDemo } from "./LandingCreateDemo";
import { LandingProductDemo } from "./LandingProductDemo";
import "./landing-guide.css";
import "./landing-demo-viewport.css";

const guideChapters = [
  {
    id: "browse",
    number: "01",
    icon: Search,
    title: "나에게 맞는 자리 찾기",
    checks: ["이름으로 검색", "유형·모집 상태로 필터"],
    alt: "모임 검색과 유형 필터로 함께 배우는 토요일을 찾는 이용 예시"
  },
  {
    id: "detail",
    number: "02",
    icon: CalendarDays,
    title: "이 모임, 나와 잘 맞을까?",
    checks: ["소개·일정·장소 확인", "참여 신청"],
    alt: "모임 소개와 일정, 모집 방식을 확인하고 참여를 신청하는 이용 예시"
  },
  {
    id: "continue",
    number: "03",
    icon: CheckCircle2,
    title: "만나는 순간부터, 다음 약속까지.",
    checks: ["참여 중인 모임 확인", "신청 결과 확인"],
    alt: "내 모임과 신청 현황을 한곳에서 확인하는 이용 예시"
  }
];

const proposalChapters = [{
  id: "proposal",
  number: "01",
  icon: Hand,
  title: "함께할 마음 모으기",
  checks: ["모임 제안 올리기", "가능한 시간, 방식, 분위기 모으기"],
  alt: "모임 제안에 함께하고 싶어요가 모이고 가능한 시간과 진행 방식, 분위기가 정리되는 자유게시판 이용 예시"
}];

const hostChapters = [
  {
    id: "create",
    number: "01",
    icon: Plus,
    title: "모임 만들기",
    checks: ["종류·이름·소개 입력", "장소·일정 설정"],
    alt: "모임 종류와 이름, 소개, 장소와 일정을 정해 모임을 만드는 이용 예시"
  },
  {
    id: "manage",
    number: "02",
    icon: ClipboardCheck,
    title: "참여 신청 관리",
    checks: ["신청 내용 확인", "승인·모집 상태 관리"],
    alt: "모임장이 신청 내용을 읽고 승인 여부를 관리하는 이용 예시"
  }
];

const inviteChapters = [{
  id: "invite",
  number: "01",
  icon: UserPlus,
  title: "함께할 사람 초대하기",
  checks: ["회원을 검색해 초대", "초대 링크 공유"],
  alt: "회원을 검색해 함께할 사람을 선택하고 초대하거나 링크를 공유하는 이용 예시"
}];

const activityChapters = [{
  id: "activity",
  number: "01",
  icon: Camera,
  title: "활동 기록 남기기",
  checks: ["사진과 글 올리기", "댓글과 하트 남기기"],
  alt: "활동 사진과 짧은 글을 올리고 댓글과 하트로 대화한 뒤 새 반응을 알림함에서 확인하는 활동 피드 이용 예시"
}];

function ProductFrame({ chapter, isActive = true, playbackActive = isActive }) {
  return (
    <figure
      aria-hidden={isActive ? undefined : "true"}
      className="landing-guide-frame"
      data-active={isActive}
      data-screen={chapter.id}
      inert={!isActive}
    >
      <div className="landing-guide-frame__window">
        <div className="landing-guide-frame__chrome" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {chapter.id === "create" ? <LandingCreateDemo label={chapter.alt} isActive={playbackActive} /> : (
          <LandingProductDemo screen={chapter.id} label={chapter.alt} isActive={playbackActive}>
            <LandingProductScene screen={chapter.id} />
          </LandingProductDemo>
        )}
      </div>
      <figcaption>서비스 이용 예시</figcaption>
    </figure>
  );
}

function ProductShowcase({ chapters, activeChapter }) {
  return (
    <div className="landing-guide__showcase">
      {chapters.map((chapter) => (
        <ProductFrame chapter={chapter} isActive={activeChapter === chapter.id} key={chapter.id} />
      ))}
    </div>
  );
}

function GuideChapter({ chapter, active }) {
  const Icon = chapter.icon;
  return (
    <article
      aria-current={active ? "step" : undefined}
      className="landing-guide-chapter"
      data-guide-chapter={chapter.id}
      id={`guide-${chapter.id}${["proposal", "invite", "activity"].includes(chapter.id) ? "-demo" : ""}`}
    >
      <div className="landing-guide-chapter__number">
        <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
        <span>{chapter.number}</span>
      </div>
      <h3>{chapter.title}</h3>
      <ul className="landing-guide-checks">
        {chapter.checks.map((check) => (
          <li key={check}>
            <CheckCircle2 aria-hidden="true" size={18} />
            {check}
          </li>
        ))}
      </ul>
      <div className="landing-guide-chapter__mobile-shot">
        <ProductFrame chapter={chapter} playbackActive={active} />
      </div>
      {chapter.id === "browse" ? (
        <Link
          className="landing-guide-link"
          data-ph-capture-attribute-action="landing_guide_groups"
          to="/groups"
        >
          모임 둘러보기
          <ArrowRight aria-hidden="true" size={19} />
        </Link>
      ) : null}
    </article>
  );
}

function GuideSection({ id, titleId, className, chapters, activeChapter, children }) {
  return (
    <section
      aria-labelledby={titleId}
      className={`landing-section landing-guide-section ${className}`}
      data-active-step={activeChapter}
      data-guide-sequence=""
      id={id}
    >
      <div className="landing-container">
        {children}
        <div className="landing-guide__layout">
          <div className="landing-guide__chapters">
            {chapters.map((chapter) => (
              <GuideChapter active={activeChapter === chapter.id} chapter={chapter} key={chapter.id} />
            ))}
          </div>
          <ProductShowcase chapters={chapters} activeChapter={activeChapter} />
        </div>
      </div>
    </section>
  );
}

export function LandingGuide({ createAction = null, activeChapter = "participate-intro" }) {
  return (
    <div className="landing-guide-flow">
      <GuideSection
        activeChapter={activeChapter}
        chapters={guideChapters}
        className="landing-guide"
        id="guide"
        titleId="guide-title"
      >
        <div
          aria-current={activeChapter === "participate-intro" ? "step" : undefined}
          className="landing-guide__intro"
          data-guide-chapter="participate-intro"
          id="how"
        >
          <p className="landing-eyebrow">01 모임에 참여하기</p>
          <h2 id="guide-title">
            관심 있는 모임을 찾았다면,
            <br />
            이렇게 참여해요.
          </h2>
          <p>
            모임을 검색하고, 상세 내용을 확인한 뒤
            <br />
            참여를 신청하세요.
          </p>
        </div>
      </GuideSection>

      <GuideSection
        activeChapter={activeChapter}
        chapters={proposalChapters}
        className="landing-guide-proposal landing-guide--reversed"
        id="guide-proposal"
        titleId="proposal-title"
      >
        <div
          aria-current={activeChapter === "proposal-intro" ? "step" : undefined}
          className="landing-guide__intro"
          data-guide-chapter="proposal-intro"
        >
          <p className="landing-eyebrow">02 자유게시판</p>
          <h2 id="proposal-title">
            이런 모임,
            <br />
            같이할 사람?
          </h2>
          <p>
            아직 작은 생각이어도 좋아요.
            <br />
            같이하겠다는 사람과 가능한 시간이 모이면, 그때 모임으로 열어요.
          </p>
          <div className="landing-guide__actions">
            <Link
              className="landing-button landing-button--soft"
              data-ph-capture-attribute-action="landing_board_explore"
              to="/board"
            >
              자유게시판 둘러보기 <ArrowRight aria-hidden="true" size={20} />
            </Link>
          </div>
        </div>
      </GuideSection>

      <GuideSection
        activeChapter={activeChapter}
        chapters={hostChapters}
        className="landing-guide-host"
        id="guide-host"
        titleId="guide-host-title"
      >
        <div
          aria-current={activeChapter === "host-intro" ? "step" : undefined}
          className="landing-guide__intro"
          data-guide-chapter="host-intro"
        >
          <p className="landing-eyebrow">03 직접 만들고 운영하기</p>
          <h2 id="guide-host-title">
            찾던 모임이 없다면,
            <br />
            내가 하나 만들면 되죠.
          </h2>
          <p>
            모임을 소개하고, 일정과 장소를 정해 함께할 사람을 모집해요.
            <br />
            들어온 참여 신청도 한곳에서 확인하고 승인할 수 있어요.
          </p>
          {createAction ? <div className="landing-guide__actions">{createAction}</div> : null}
        </div>
      </GuideSection>

      <GuideSection
        activeChapter={activeChapter}
        chapters={inviteChapters}
        className="landing-guide-invite landing-guide--reversed"
        id="guide-invite"
        titleId="invite-title"
      >
        <div
          aria-current={activeChapter === "invite-intro" ? "step" : undefined}
          className="landing-guide__intro"
          data-guide-chapter="invite-intro"
        >
          <p className="landing-eyebrow">04 초대하기</p>
          <h2 id="invite-title">이 자리, 네가 함께하면 좋겠어.</h2>
        </div>
      </GuideSection>

      <GuideSection
        activeChapter={activeChapter}
        chapters={activityChapters}
        className="landing-guide-activity"
        id="guide-activity"
        titleId="activity-title"
      >
        <div
          aria-current={activeChapter === "activity-intro" ? "step" : undefined}
          className="landing-guide__intro"
          data-guide-chapter="activity-intro"
        >
          <p className="landing-eyebrow">05 활동 피드</p>
          <h2 id="activity-title">함께한 순간은, 우리의 기록으로.</h2>
        </div>
      </GuideSection>
    </div>
  );
}
