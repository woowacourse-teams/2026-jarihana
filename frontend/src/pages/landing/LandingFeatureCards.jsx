import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { gameArtwork } from "../games/artworkAssets";
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

function SparringPreview() {
  return (
    <span aria-hidden="true" className="landing-feature-card__panel">
      <span className="landing-feature-card__hint">토론 진행 중...</span>
      <strong className="landing-feature-card__title">개발 공부, 강의부터? 만들면서?</strong>
      <span className="landing-feature-card__versus">
        <span style={{ width: "46%" }} />
        <span style={{ width: "54%" }} />
      </span>
      <span className="landing-feature-card__sides"><span>강의부터</span><span>만들면서</span></span>
      <span className="landing-feature-card__row landing-feature-card__row--dot"><i data-side="mint" />내 편 고르기</span>
      <span className="landing-feature-card__row landing-feature-card__row--dot"><i data-side="coral" />한마디로 받아치기</span>
    </span>
  );
}

function GamesPreview() {
  return (
    <span aria-hidden="true" className="landing-feature-card__panel">
      <span className="landing-feature-card__hint">게임하나?</span>
      <strong className="landing-feature-card__title">행성이의 리듬 작살</strong>
      <img alt="" className="landing-feature-card__art" height="600" loading="lazy" src={gameArtwork.rhythm} width="900" />
      <span className="landing-feature-card__row"><span>오목</span><strong>대국 기록과 랭킹</strong></span>
      <span className="landing-feature-card__row"><span>리듬 작살</span><strong>난이도별 랭킹</strong></span>
    </span>
  );
}

const features = [
  {
    id: "create",
    to: "/land/create",
    action: "landing_feature_create",
    tone: "mint",
    title: ["주제와 일정만 정하면", "오늘 바로 모임을 열 수 있어요"],
    link: "모임 만들기",
    Preview: CreatePreview
  },
  {
    id: "sparring",
    to: "/land/sparring",
    action: "landing_feature_sparring",
    tone: "coral",
    title: ["두 편 중 하나를 고르고", "한마디로 받아쳐요"],
    link: "토론하나? 둘러보기",
    Preview: SparringPreview
  },
  {
    id: "games",
    to: "/land/games",
    action: "landing_feature_games",
    tone: "lavender",
    title: ["모임 사람들과 한 판 하고", "기록과 랭킹을 나눠요"],
    link: "게임하나? 둘러보기",
    Preview: GamesPreview
  }
];

export function LandingFeatureCards({ active }) {
  return (
    <section
      aria-current={active ? "step" : undefined}
      aria-labelledby="features-title"
      className="landing-features"
      data-guide-chapter="features"
      id="features"
    >
      <div className="landing-features__heading">
        <p>자리하나에서 할 수 있는 일</p>
        <h2 id="features-title">
          <span>모임을 열고, 토론하고,</span>
          <span>한 판 겨뤄요</span>
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
