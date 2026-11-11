import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import studyImage from "../../shared/assets/landing/default-group-study.webp";
import clubImage from "../../shared/assets/landing/default-group-club.webp";
import sessionImage from "../../shared/assets/landing/default-group-session.webp";
import arenaImage from "../../shared/assets/landing/sparring-arena-demo-end.webp";
import { gameArtwork } from "../games/artworkAssets";
import { LandingShell, LandingStartButton } from "./LandingChrome";
import { CreatePreview, JoinPreview } from "./LandingFeatureCards";
import {
  GuideSection,
  activityChapters,
  chatChapters,
  guideChapters,
  hostChapters,
  inviteChapters,
  proposalChapters,
  sparringChapters
} from "./LandingGuide";
import { useLandingChapters } from "./useLandingChapters";
import "./landing-features.css";

function FeatureHero({ action, eyebrow, lead, note, title, tone, visual }) {
  return (
    <section aria-labelledby="feature-title" className="landing-feature-page__hero" data-tone={tone}>
      <div className="landing-feature-page__hero-inner">
        <div className="landing-feature-page__copy">
          <p className="landing-eyebrow">{eyebrow}</p>
          <h1 id="feature-title">
            {title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p>{lead}</p>
          {action}
          <p className="landing-feature-page__note">{note}</p>
        </div>
        <div className="landing-feature-page__visual">{visual}</div>
      </div>
    </section>
  );
}

function GuideIntro({ action, active, chapter, eyebrow, text, title, titleId }) {
  return (
    <div aria-current={active ? "step" : undefined} className="landing-guide__intro" data-guide-chapter={chapter}>
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 id={titleId}>
        {title[0]}
        {title[1] ? (
          <>
            <br />
            {title[1]}
          </>
        ) : null}
      </h2>
      {text ? <p>{text}</p> : null}
      {action ? <div className="landing-guide__actions">{action}</div> : null}
    </div>
  );
}

function FeatureClosing({ action, title }) {
  return (
    <section aria-labelledby="feature-closing-title" className="landing-container landing-feature-page__closing">
      <h2 id="feature-closing-title">
        {title.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </h2>
      {action}
      <Link className="landing-feature-page__back" data-ph-capture-attribute-action="landing_feature_back" to="/land">
        자리하나? 처음 화면으로
      </Link>
    </section>
  );
}

function ExploreAction() {
  return (
    <Link
      className="landing-button landing-button--mint landing-button--large"
      data-ph-capture-attribute-action="landing_explore"
      to="/groups?recruiting=true"
    >
      모집 중인 모임 보기 <ArrowRight aria-hidden="true" size={20} />
    </Link>
  );
}

// 모임 신청 소개: 찾기와 신청, 신청 결과 확인, 참여한 뒤의 채팅과 일정, 활동 피드를 차례로 보여 준다.
export function LandingJoinPage() {
  const rootRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState("join-intro");
  useLandingChapters(rootRef, setActiveChapter);

  return (
    <LandingShell rootRef={rootRef}>
      <FeatureHero
        action={<ExploreAction />}
        eyebrow="모임 신청"
        lead="이름으로 검색하거나 유형과 모집 상태로 골라 보고, 소개와 일정을 확인한 뒤 신청해요. 신청 결과와 참여 중인 모임은 내 모임에서 확인해요."
        note="모임 둘러보기는 로그인 없이, 참여 신청은 가입한 뒤에 할 수 있어요."
        title={["관심 가는 모임을 찾아", "바로 참여를 신청해요"]}
        tone="sky"
        visual={<JoinPreview />}
      />
      <div className="landing-guide-flow">
        <GuideSection
          activeChapter={activeChapter}
          chapters={guideChapters}
          className="landing-guide"
          id="guide-join"
          titleId="join-guide-title"
        >
          <GuideIntro
            active={activeChapter === "join-intro"}
            chapter="join-intro"
            eyebrow="01 찾고 신청하기"
            text="모임을 검색하고 상세 내용을 확인한 뒤 참여를 신청해요."
            title={["관심 있는 모임을 찾았다면,", "이렇게 참여해요."]}
            titleId="join-guide-title"
          />
        </GuideSection>
        <GuideSection
          activeChapter={activeChapter}
          chapters={chatChapters}
          className="landing-guide-chat landing-guide--reversed"
          id="guide-chat"
          titleId="chat-title"
        >
          <GuideIntro
            active={activeChapter === "chat-intro"}
            chapter="chat-intro"
            eyebrow="02 모임 채팅과 일정"
            text="모임에 참여하면 대화방이 바로 열려요. 정기 모임과 개별 일정도 캘린더에서 함께 확인해요."
            title={["모임 단톡방,", "따로 만들 필요 없어요."]}
            titleId="chat-title"
          />
        </GuideSection>
        <GuideSection
          activeChapter={activeChapter}
          chapters={activityChapters}
          className="landing-guide-activity"
          id="guide-activity"
          titleId="activity-title"
        >
          <GuideIntro
            active={activeChapter === "activity-intro"}
            chapter="activity-intro"
            eyebrow="03 활동 피드"
            text="내 기록에 달린 댓글과 하트는 알림함으로 알려 드려요."
            title={["함께한 순간을 기록으로 남겨요."]}
            titleId="activity-title"
          />
        </GuideSection>
      </div>
      <FeatureClosing action={<ExploreAction />} title={["함께할 자리,", "지금 찾아볼까요?"]} />
    </LandingShell>
  );
}

const groupTypes = [
  {
    id: "study",
    label: "스터디",
    description: "공부할 주제를 정하고 정기적으로 만나요. 매주 만날 요일과 시간도 미리 잡아 둘 수 있어요.",
    image: studyImage
  },
  {
    id: "club",
    label: "동아리",
    description: "취미가 같은 사람들과 꾸준히 활동해요. 러닝, 밴드, 보드게임처럼 오래 가는 모임에 맞아요.",
    image: clubImage
  },
  {
    id: "session",
    label: "같이해요",
    description: "날짜 하나만 정해 한 번 모여요. 저녁 번개나 기술 공유 모임처럼 가볍게 열기 좋아요.",
    image: sessionImage
  }
];

// 모임 만들기 소개: 모임 종류, 만들기와 신청 관리, 초대, 자유게시판에서 먼저 사람 모으기를 차례로 보여 준다.
export function LandingCreatePage() {
  const rootRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState("host-intro");
  useLandingChapters(rootRef, setActiveChapter);
  const createAction = (
    <LandingStartButton className="landing-button--mint landing-button--large" target="/groups/new">
      모임 만들기 <ArrowRight aria-hidden="true" size={20} />
    </LandingStartButton>
  );

  return (
    <LandingShell rootRef={rootRef}>
      <FeatureHero
        action={createAction}
        eyebrow="모임 만들기"
        lead="스터디, 동아리, 하루 번개 중 하나를 고르고 일정과 장소를 정하면 모집이 시작돼요. 들어온 신청은 한곳에서 확인해요."
        note="로그인 전이라도 괜찮아요. GitHub로 로그인하면 모임 만들기 화면으로 바로 이어져요."
        title={["주제와 일정만 정하면", "오늘 바로 모임을 열 수 있어요"]}
        tone="mint"
        visual={<CreatePreview />}
      />
      <section aria-labelledby="group-types-title" className="landing-section landing-container">
        <h2 className="landing-feature-page__section-title" id="group-types-title">세 가지 방식으로 모임을 열 수 있어요</h2>
        <ul className="landing-feature-page__grid">
          {groupTypes.map((type) => (
            <li key={type.id}>
              <span aria-hidden="true" className="landing-feature-page__type-art">
                <img alt="" height="1254" loading="lazy" src={type.image} width="1254" />
              </span>
              <h3>{type.label}</h3>
              <p>{type.description}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="landing-guide-flow">
        <GuideSection
          activeChapter={activeChapter}
          chapters={hostChapters}
          className="landing-guide-host"
          id="guide-host"
          titleId="guide-host-title"
        >
          <GuideIntro
            active={activeChapter === "host-intro"}
            chapter="host-intro"
            eyebrow="01 만들고 관리하기"
            text="모임을 소개하고 일정과 장소를 정해 함께할 사람을 모집해요. 들어온 참여 신청도 한곳에서 확인하고 승인해요."
            title={["찾던 모임이 없다면,", "내가 하나 만들면 되죠."]}
            titleId="guide-host-title"
          />
        </GuideSection>
        <GuideSection
          activeChapter={activeChapter}
          chapters={inviteChapters}
          className="landing-guide-invite landing-guide--reversed"
          id="guide-invite"
          titleId="invite-title"
        >
          <GuideIntro
            active={activeChapter === "invite-intro"}
            chapter="invite-intro"
            eyebrow="02 초대하기"
            title={["이 자리, 네가 함께하면 좋겠어."]}
            titleId="invite-title"
          />
        </GuideSection>
        <GuideSection
          activeChapter={activeChapter}
          chapters={proposalChapters}
          className="landing-guide-proposal"
          id="guide-proposal"
          titleId="proposal-title"
        >
          <GuideIntro
            action={
              <Link
                className="landing-button landing-button--soft"
                data-ph-capture-attribute-action="landing_board_explore"
                to="/board"
              >
                자유게시판 둘러보기 <ArrowRight aria-hidden="true" size={20} />
              </Link>
            }
            active={activeChapter === "proposal-intro"}
            chapter="proposal-intro"
            eyebrow="03 먼저 같이할 사람 모으기"
            text="아직 작은 생각이어도 좋아요. 자유게시판에 제안을 올려 같이할 사람과 가능한 시간이 모이면, 그때 모임으로 열어요."
            title={["이런 모임,", "같이할 사람?"]}
            titleId="proposal-title"
          />
        </GuideSection>
      </div>
      <FeatureClosing action={createAction} title={["함께할 사람,", "지금 모아 볼까요?"]} />
    </LandingShell>
  );
}

const sparringSteps = [
  { id: "pick", title: "편 고르기", description: "두 입장 중 내 생각에 가까운 쪽을 골라요. 투표 비율이 바로 막대로 보여요." },
  { id: "send", title: "한마디 보내기", description: "한마디를 캡슐에 담아 보내면 내 편 쪽에 쌓여요." },
  { id: "reply", title: "받아치기", description: "상대 편 한마디에 받아치면 두 캐릭터가 VS로 마주 서요." }
];

export function LandingSparringPage() {
  const rootRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState("sparring-intro");
  useLandingChapters(rootRef, setActiveChapter);
  const sparringAction = (
    <Link
      className="landing-button landing-button--mint landing-button--large"
      data-ph-capture-attribute-action="landing_sparring_explore"
      to="/sparring"
    >
      토론 둘러보기 <ArrowRight aria-hidden="true" size={20} />
    </Link>
  );

  return (
    <LandingShell rootRef={rootRef}>
      <FeatureHero
        action={sparringAction}
        eyebrow="토론하나?"
        lead="내 생각에 가까운 편을 고르고, 한마디를 캡슐에 담아 보내요. 마음에 걸리는 한마디에는 받아치기로 답해요."
        note="구경은 로그인 없이, 한마디는 가입한 뒤에 남길 수 있어요."
        title={["누구 말이 맞을까?", "편을 고르고 한마디"]}
        tone="coral"
        visual={
          <img
            alt="토론 경기장에서 두 편의 캐릭터가 VS로 마주 선 장면"
            height="1090"
            src={arenaImage}
            width="1146"
          />
        }
      />
      <section aria-labelledby="sparring-steps-title" className="landing-section landing-container">
        <h2 className="landing-feature-page__section-title" id="sparring-steps-title">토론은 세 단계면 충분해요</h2>
        <ol className="landing-feature-page__grid">
          {sparringSteps.map((step) => (
            <li key={step.id}>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="landing-guide-flow">
        <GuideSection
          activeChapter={activeChapter}
          chapters={sparringChapters}
          className="landing-guide-sparring"
          id="guide-sparring"
          titleId="sparring-title"
        >
          <GuideIntro
            active={activeChapter === "sparring-intro"}
            chapter="sparring-intro"
            eyebrow="토론 경기장"
            text="편을 고르고 받아치기를 보내면 경기장에서 바로 맞붙어요."
            title={["실제 경기장에서", "이렇게 주고받아요"]}
            titleId="sparring-title"
          />
        </GuideSection>
      </div>
      <FeatureClosing action={sparringAction} title={["궁금한 주제가 있다면", "지금 들어가 보세요"]} />
    </LandingShell>
  );
}

const games = [
  {
    id: "gomoku",
    title: "오목",
    summary: "친구와 함께하는 1:1 오목",
    image: gameArtwork.gomoku,
    points: ["초대 링크로 친구를 불러 바로 대국해요.", "다른 사람의 대국을 관전할 수 있어요.", "대국 기록이 쌓이고 랭킹에도 올라가요."]
  },
  {
    id: "rhythm",
    title: "행성이의 리듬 작살",
    summary: "비트에 맞춰 세균을 잡는 1인 리듬게임",
    image: gameArtwork.rhythm,
    points: ["따라 하기로 조작을 익혀요.", "연습에서 난이도와 배속을 골라요.", "공식 도전 기록이 난이도별 랭킹에 올라가요."]
  }
];

export function LandingGamesPage() {
  const rootRef = useRef(null);
  const gamesAction = (
    <Link
      className="landing-button landing-button--mint landing-button--large"
      data-ph-capture-attribute-action="landing_games_explore"
      to="/games"
    >
      게임방 가기 <ArrowRight aria-hidden="true" size={20} />
    </Link>
  );

  return (
    <LandingShell rootRef={rootRef}>
      <FeatureHero
        action={gamesAction}
        eyebrow="게임하나?"
        lead="잠깐 쉬었다, 한 판 어때요? 친구를 불러 오목을 두고, 리듬게임 공식 도전에서 서로의 기록을 겨뤄요."
        note="연습은 로그인 없이, 대국과 공식 도전은 가입한 뒤에 할 수 있어요."
        title={["모임 사람들과 한 판 하고", "랭킹에 이름도 올려 봐요"]}
        tone="lavender"
        visual={<img alt="행성이가 네 방향에서 오는 세균을 작살로 잡는 리듬 작살 그림" height="1024" src={gameArtwork.rhythm} width="1536" />}
      />
      <section aria-labelledby="games-title" className="landing-section landing-container">
        <h2 className="landing-feature-page__section-title" id="games-title">지금 할 수 있는 게임</h2>
        <ul className="landing-feature-page__grid landing-feature-page__games">
          {games.map((game) => (
            <li key={game.id}>
              <img alt="" height="1024" loading="lazy" src={game.image} width="1536" />
              <h3>{game.title}</h3>
              <p>{game.summary}</p>
              <ul>
                {game.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <FeatureClosing action={gamesAction} title={["잠깐 쉬었다,", "한 판 어때요?"]} />
    </LandingShell>
  );
}
