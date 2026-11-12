import { ArrowRight, Search } from "lucide-react";
import { Link } from "react-router";

import faceoffVideo from "../../shared/assets/landing/landing-sparring-faceoff.mp4";
import faceoffPoster from "../../shared/assets/landing/landing-sparring-faceoff.webp";
import { gameArtwork } from "../games/artworkAssets";
import { LandingLoopVideo } from "./LandingLoopVideo";
import "./landing-features.css";

export function CreatePreview() {
  return (
    <span aria-hidden="true" className="landing-feature-card__panel">
      <span className="landing-feature-card__hint">새 모임 만드는 중...</span>
      <strong className="landing-feature-card__title">함께 배우는 토요일</strong>
      <span className="landing-feature-card__chips">
        <span data-selected="true">스터디</span>
        <span>동아리</span>
        <span>같이해요</span>
      </span>
      <span className="landing-feature-card__row"><span>일정</span><strong>매주 토 14:00</strong></span>
      <span className="landing-feature-card__row"><span>장소</span><strong>강남역 스터디룸</strong></span>
      <span className="landing-feature-card__row"><span>모집</span><strong>승인제, 정원 6명</strong></span>
      <span className="landing-feature-card__cta">모임 만들기</span>
    </span>
  );
}

export function JoinPreview() {
  return (
    <span aria-hidden="true" className="landing-feature-card__panel">
      <span className="landing-feature-card__hint">참여할 모임 찾는 중...</span>
      <span className="landing-feature-card__row landing-feature-card__row--search">
        <Search size={16} strokeWidth={2.2} />
        스터디
      </span>
      <strong className="landing-feature-card__title">함께 배우는 토요일</strong>
      <span className="landing-feature-card__row"><span>일정</span><strong>매주 토 14:00</strong></span>
      <span className="landing-feature-card__row"><span>장소</span><strong>강남역 스터디룸</strong></span>
      <span className="landing-feature-card__cta">참여 신청</span>
    </span>
  );
}

// 토론하나? 카드는 실제 경기장 녹화에서 받아치기가 들어온 뒤 두 캐릭터가 의자에 앉아 VS로 맞서고
// 의자를 들고 맞붙는 장면만 잘라 반복한다.
function SparringPreview() {
  return (
    <span aria-hidden="true" className="landing-feature-card__screen">
      <LandingLoopVideo poster={faceoffPoster} src={faceoffVideo} />
    </span>
  );
}

function GamesPreview() {
  return (
    <span aria-hidden="true" className="landing-feature-card__panel landing-feature-card__panel--list">
      <span className="landing-feature-card__hint">게임하나?</span>
      <strong className="landing-feature-card__title">행성이의 리듬 작살</strong>
      <img alt="" className="landing-feature-card__art" height="600" loading="lazy" src={gameArtwork.rhythm} width="900" />
      <span className="landing-feature-card__row"><span>오목</span><strong>대국 기록과 랭킹</strong></span>
      <span className="landing-feature-card__row"><span>공평하게 반띵</span><strong>최고 기록 랭킹</strong></span>
      <span className="landing-feature-card__row"><span>리듬 작살</span><strong>난이도별 랭킹</strong></span>
    </span>
  );
}

// 핵심 기능: 모임 신청과 모임 만들기. 세부 기능은 카드가 여는 소개 페이지에서 설명한다.
const coreFeatures = [
  {
    id: "join",
    to: "/land/join",
    action: "landing_feature_join",
    tone: "sky",
    title: ["관심 가는 모임을 찾아", "바로 참여를 신청해요"],
    link: "모임 신청 자세히 보기",
    Preview: JoinPreview
  },
  {
    id: "create",
    to: "/land/create",
    action: "landing_feature_create",
    tone: "mint",
    title: ["주제와 일정만 정하면", "오늘 바로 모임을 열 수 있어요"],
    link: "모임 만들기 자세히 보기",
    Preview: CreatePreview
  }
];

const extraFeatures = [
  {
    id: "sparring",
    to: "/land/sparring",
    action: "landing_feature_sparring",
    tone: "coral",
    title: ["편을 골라 한마디 받아치면", "내 캐릭터가 대신 맞붙어요"],
    link: "토론하나? 둘러보기",
    Preview: SparringPreview
  },
  {
    id: "games",
    to: "/land/games",
    action: "landing_feature_games",
    tone: "lavender",
    title: ["쉬는 시간에 한 판 하고", "랭킹 1위도 노려 봐요"],
    link: "게임하나? 둘러보기",
    Preview: GamesPreview
  }
];

function FeatureCardSection({ active, chapter, eyebrow, features, title }) {
  const titleId = `${chapter}-title`;
  return (
    <section
      aria-current={active ? "step" : undefined}
      aria-labelledby={titleId}
      className="landing-features"
      data-guide-chapter={chapter}
      id={chapter}
    >
      <div className="landing-features__heading">
        <p>{eyebrow}</p>
        <h2 id={titleId}>
          {title.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>
      </div>
      <ul className="landing-features__list">
        {features.map(({ Preview, ...feature }) => (
          <li key={feature.id}>
            <Link
              className="landing-feature-card"
              data-ph-capture-attribute-action={feature.action}
              data-tone={feature.tone}
              to={feature.to}
            >
              <span className="landing-feature-card__visual">
                <Preview />
                <span aria-hidden="true" className="landing-feature-card__arrow">
                  <ArrowRight size={24} strokeWidth={2.2} />
                </span>
              </span>
              <span className="landing-feature-card__text">
                <strong>
                  {feature.title[0]}
                  <br />
                  {feature.title[1]}
                </strong>
                <span>{feature.link}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LandingCoreCards({ active }) {
  return (
    <FeatureCardSection
      active={active}
      chapter="core"
      eyebrow="자리하나?에서 할 수 있는 일"
      features={coreFeatures}
      title={["함께할 모임을 찾거나,", "직접 열어 보세요"]}
    />
  );
}

export function LandingFeatureCards({ active }) {
  return (
    <FeatureCardSection
      active={active}
      chapter="features"
      eyebrow="모임이 없는 날에도 심심할 틈 없게"
      features={extraFeatures}
      title={["말로 한 판 붙고,", "게임으로도 겨뤄봐요"]}
    />
  );
}
