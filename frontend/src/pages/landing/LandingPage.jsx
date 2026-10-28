import { useRef, useState } from "react";
import { ArrowDown, ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router";

import { storeReturnTarget, useAuth } from "../../features/auth";
import logo from "../../shared/assets/brand/jarihana-favicon.png";
import githubMark from "../../shared/assets/brand/github-mark.svg";
import heroImage from "../../shared/assets/landing/landing-brand-hero.webp";
import heroRoomImage from "../../shared/assets/landing/landing-hero-room.webp";
import heroMobileImage from "../../shared/assets/landing/landing-brand-hero-mobile.webp";
import heroRoomMobileImage from "../../shared/assets/landing/landing-hero-room-mobile.webp";
import heroChairImage from "../../shared/assets/landing/landing-hero-chair.webp";
import studyImage from "../../shared/assets/landing/default-group-study.webp";
import clubImage from "../../shared/assets/landing/default-group-club.webp";
import sessionImage from "../../shared/assets/landing/default-group-session.webp";
import { useLandingMotion } from "./useLandingMotion";
import { useLandingQuestionScroll } from "./useLandingQuestionScroll";
import { useLandingGuideScroll } from "./useLandingGuideScroll";
import { LandingGuide } from "./LandingGuide";
import "./landing-tokens.css";
import "./landing.css";

const groupTypes = [
  {
    id: "study",
    type: "STUDY",
    label: "스터디",
    title: "알고리즘 풀이 · 기술 서적 읽기",
    description: "공부할 주제를 정하고, 정기적으로 만나요.",
    image: studyImage,
    imageAlt: "책상 앞에서 함께 공부하는 스터디 대표 이미지",
    action: "landing_study_explore",
    selectAction: "landing_study_select"
  },
  {
    id: "club",
    type: "CLUB",
    label: "동아리",
    title: "러닝 · 밴드 · 독서",
    description: "취미가 같은 사람들과 꾸준히 활동해요.",
    image: clubImage,
    imageAlt: "기타를 연주하며 취미를 나누는 동아리 대표 이미지",
    action: "landing_club_explore",
    selectAction: "landing_club_select"
  },
  {
    id: "session",
    type: "SESSION",
    label: "같이해요",
    title: "저녁 번개, 기술 공유 모임",
    description: "날짜를 정해 한 번 함께해요.",
    image: sessionImage,
    imageAlt: "반갑게 하이파이브하는 같이해요 대표 이미지",
    action: "landing_session_explore",
    selectAction: "landing_session_select"
  }
];

function LandingStartButton({ children = "시작하기", className = "", target = "/home" }) {
  const { login, status } = useAuth();
  const [error, setError] = useState("");
  const classes = `landing-button ${className}`;

  if (status === "authenticated") {
    return (
      <Link
        className={classes}
        data-ph-capture-attribute-action={target === "/groups/new" ? "group_create" : "group_home"}
        to={target}
      >
        {target === "/groups/new" ? children : <>홈으로 가기 <ArrowRight aria-hidden="true" size={18} /></>}
      </Link>
    );
  }

  if (status === "signup-required") {
    return (
      <Link
        className={classes}
        data-ph-capture-attribute-action="signup_continue"
        onClick={() => storeReturnTarget(target)}
        to="/signup"
      >
        가입 계속하기
        <ArrowRight aria-hidden="true" size={18} />
      </Link>
    );
  }

  function start() {
    try {
      storeReturnTarget(target);
      login();
    } catch {
      setError("로그인을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <span className="landing-start">
      <button
        className={classes}
        data-ph-capture-attribute-action="login"
        disabled={status === "loading"}
        onClick={start}
        type="button"
      >
        {status === "loading" ? "연결 중" : children}
      </button>
      {error ? (
        <span className="landing-start__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function LandingTextLink({ children, to, action }) {
  return (
    <Link className="landing-text-link" data-ph-capture-attribute-action={action} to={to}>
      {children}
      <ArrowRight aria-hidden="true" size={20} />
    </Link>
  );
}

function LandingSectionHeading({ eyebrow, children, id }) {
  return (
    <div className="landing-heading" data-landing-reveal="">
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 id={id}>{children}</h2>
    </div>
  );
}

function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <a
          aria-label="자리하나 홈"
          className="landing-brand"
          data-ph-capture-attribute-action="landing_home"
          href="#landing-top"
        >
          <img alt="" height="40" src={logo} width="40" />
          <span>자리하나</span>
        </a>
        <div className="landing-header__actions">
          <Link
            className="landing-header__explore"
            data-ph-capture-attribute-action="landing_explore"
            to="/groups"
          >
            둘러보기
          </Link>
          <LandingStartButton />
        </div>
      </div>
    </header>
  );
}

function LandingHero() {
  const heroRef = useRef(null);
  useLandingQuestionScroll(heroRef);
  const [roomReady, setRoomReady] = useState(false);
  const [chairReady, setChairReady] = useState(false);
  const motionReady = roomReady && chairReady;
  return (
    <section
      aria-label="함께하는 일상의 시작"
      className="landing-hero"
      data-ready={motionReady}
      ref={heroRef}
    >
      <div className="landing-hero__sticky">
        <div className="landing-hero__questions">
          <p className="landing-question landing-question--study">
            <span>혼자 공부하다가,</span>
            <strong>누군가에게 물어보고 싶었던 적 있나요?</strong>
          </p>
          <p className="landing-question landing-question--lunch">
            <span>금요일 저녁,</span>
            <strong>다들 어디 모였는지 궁금했던 적 있나요?</strong>
          </p>
          <p className="landing-question landing-question--growth">
            <span>나만 모르는 사이,</span>
            <strong>다들 함께 성장하고 있는 것 같았나요?</strong>
          </p>
          <p className="landing-question landing-question--answer">
            <span>나도 함께하고 싶었는데,</span>
            <strong>어디서 시작할지 몰랐다면.</strong>
          </p>
          <div className="landing-hero__scroll-note">
            <span>천천히 내려보세요</span>
            <ArrowDown aria-hidden="true" size={18} />
          </div>
        </div>
        <a
          className="landing-hero__skip"
          data-ph-capture-attribute-action="landing_intro_skip"
          href="#about"
        >
          서비스 소개 바로 보기 <ArrowRight aria-hidden="true" size={16} />
        </a>
        <div className="landing-hero__visual">
          <div className="landing-hero__frame">
            <div className="landing-hero__scene">
              <div
                aria-label="스크롤하면 함께 이야기하는 친구들 앞의 민트색 의자가 사진 프레임 밖으로 다가오는 3D 장면"
                className="landing-hero__media"
                role="img"
              >
                <picture>
                  <source media="(max-width: 767px)" srcSet={heroMobileImage} />
                  <img
                    alt=""
                    className="landing-hero__still"
                    fetchPriority="high"
                    height="941"
                    src={heroImage}
                    width="1672"
                  />
                </picture>
                <picture>
                  <source media="(max-width: 767px)" srcSet={heroRoomMobileImage} />
                  <img
                    alt=""
                    className="landing-hero__room"
                    fetchPriority="high"
                    height="941"
                    onLoad={() => setRoomReady(true)}
                    src={heroRoomImage}
                    width="1672"
                  />
                </picture>
              </div>
              <div aria-hidden="true" className="landing-hero__shade" />
            </div>
          </div>
          <div aria-hidden="true" className="landing-hero__foreground">
            <div className="landing-hero__artwork">
              <div className="landing-hero__chair-motion">
                <span className="landing-hero__chair-shadow" />
                <img
                  alt=""
                  className="landing-hero__chair"
                  fetchPriority="high"
                  height="1254"
                  onLoad={() => setChairReady(true)}
                  src={heroChairImage}
                  width="1254"
                />
              </div>
            </div>
          </div>
          <h1 className="landing-hero__title">
            <span>함께하고 싶은 순간,</span>
            <span>여기, 자리하나.</span>
          </h1>
        </div>
      </div>
    </section>
  );
}

function TogetherSection({ active }) {
  const [selected, setSelected] = useState("study");
  return (
    <section
      aria-labelledby="together-title"
      className="landing-section landing-together"
      aria-current={active ? "step" : undefined}
      data-guide-chapter="together"
      id="together"
    >
      <div className="landing-container landing-together__layout">
        <div className="landing-together__copy">
          <LandingSectionHeading eyebrow="모임 종류" id="together-title">
            어떤 모임을<br />찾고 있나요?
          </LandingSectionHeading>
          <div className="landing-types">
            {groupTypes.map((item) => (
              <div className="landing-type" data-active={selected === item.id} key={item.id}>
                <h3>
                  <button
                    aria-controls={`type-panel-${item.id}`}
                    aria-expanded={selected === item.id}
                    data-ph-capture-attribute-action={item.selectAction}
                    id={`type-button-${item.id}`}
                    onClick={() => setSelected(item.id)}
                    type="button"
                  >
                    {item.label}
                    <ChevronDown aria-hidden="true" size={20} />
                  </button>
                </h3>
                <div
                  aria-hidden={selected !== item.id}
                  aria-labelledby={`type-button-${item.id}`}
                  className="landing-type__panel"
                  inert={selected !== item.id}
                  id={`type-panel-${item.id}`}
                  role="region"
                >
                  <div className="landing-type__panel-inner">
                    <p>{item.description}</p>
                    <LandingTextLink action={item.action} to={`/groups?type=${item.type}`}>
                      {item.label} 둘러보기
                    </LandingTextLink>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="landing-together__visual" data-landing-reveal="">
          {groupTypes.map((item) => (
            <div
              aria-hidden={selected !== item.id}
              className={`landing-type-art landing-type-art--${item.id}`}
              data-active={selected === item.id}
              key={item.id}
            >
              <div className="landing-type-art__illustration">
                <img
                  alt={item.imageAlt}
                  height="1254"
                  loading="lazy"
                  src={item.image}
                  width="1254"
                />
              </div>
              <p>{item.title}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const pageRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState("about");
  useLandingMotion(pageRef);
  useLandingGuideScroll(pageRef, setActiveChapter);
  return (
    <div className="landing-page" id="landing-top" ref={pageRef}>
      <a
        className="skip-link"
        data-ph-capture-attribute-action="skip_to_content"
        href="#main-content"
      >
        본문으로 건너뛰기
      </a>
      <LandingHeader />
      <main id="main-content" tabIndex="-1">
        <LandingHero />
        <section
          aria-current={activeChapter === "about" ? "step" : undefined}
          aria-labelledby="about-title"
          className="landing-section landing-about"
          data-guide-chapter="about"
          id="about"
        >
          <div className="landing-container landing-heading" data-landing-reveal="">
            <h2 id="about-title">일하는 사람도 배우는 사람도,<br />모임은 여기서 찾아요.</h2>
            <p className="landing-description">
              함께 공부할 스터디부터 취미를 나눌 동아리까지.
              <br />모집 중인 모임을 살펴보고, 원하는 모임에 참여를 신청해요.
            </p>
          </div>
        </section>
        <TogetherSection active={activeChapter === "together"} />
        <LandingGuide
          activeChapter={activeChapter}
          createAction={
            <LandingStartButton className="landing-button--soft" target="/groups/new">
              모임 만들기 <ArrowRight aria-hidden="true" size={20} />
            </LandingStartButton>
          }
        />
        <section
          aria-current={activeChapter === "start" ? "step" : undefined}
          aria-labelledby="start-title"
          className="landing-start-section"
          data-guide-chapter="start"
          id="start"
        >
          <div className="landing-container landing-start-section__inner">
            <div data-landing-reveal="">
              <p className="landing-eyebrow">함께할 준비, 되었나요?</p>
              <h2 id="start-title">
                당신을 위한
                <br />
                자리 하나.
              </h2>
              <LandingStartButton className="landing-button--large">
                <img alt="" height="20" src={githubMark} width="20" />
                GitHub로 시작하기
                <ArrowRight aria-hidden="true" size={20} />
              </LandingStartButton>
              <div>
                <LandingTextLink action="landing_explore" to="/groups">
                  모임 둘러보기
                </LandingTextLink>
              </div>
            </div>
            <img
              alt=""
              className="landing-start-section__chair"
              height="1254"
              loading="lazy"
              src={heroChairImage}
              width="1254"
            />
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <div>
            <a
              className="landing-brand"
              data-ph-capture-attribute-action="landing_home"
              href="#landing-top"
            >
              <img alt="" height="36" src={logo} width="36" />
              <span>자리하나</span>
            </a>
            <p>함께할 사람을 만나는 가장 가벼운 시작.</p>
            <small>© {new Date().getFullYear()} 자리하나</small>
          </div>
          <nav aria-label="하단 메뉴">
            <Link data-ph-capture-attribute-action="landing_explore" to="/groups">
              모임 둘러보기
            </Link>
            <a data-ph-capture-attribute-action="landing_about_view" href="#about">
              자리하나 소개
            </a>
            <a data-ph-capture-attribute-action="landing_how_view" href="#how">
              이용방법
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
