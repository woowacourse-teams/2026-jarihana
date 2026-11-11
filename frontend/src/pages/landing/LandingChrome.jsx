import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router";

import { storeReturnTarget, useAuth } from "../../features/auth";
import logo from "../../shared/assets/brand/jarihana-favicon.png";
import "./landing-tokens.css";
import "./landing.css";
import "./landing-chrome.css";

export function LandingStartButton({ children = "시작하기", className = "", target = "/home" }) {
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

function LandingBrand({ size, onLanding }) {
  const content = (
    <>
      <img alt="" height={size} src={logo} width={size} />
      <span>자리하나?</span>
    </>
  );
  if (onLanding) {
    return (
      <a aria-label="자리하나 홈" className="landing-brand" data-ph-capture-attribute-action="landing_home" href="#landing-top">
        {content}
      </a>
    );
  }
  return (
    <Link aria-label="자리하나 홈" className="landing-brand" data-ph-capture-attribute-action="landing_home" to="/land">
      {content}
    </Link>
  );
}

export function LandingHeader() {
  const { pathname } = useLocation();
  const onLanding = pathname.replace(/\/$/, "") === "/land";
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <LandingBrand onLanding={onLanding} size="40" />
        <nav aria-label="주요 메뉴" className="landing-header__nav">
          <Link data-ph-capture-attribute-action="landing_nav_groups" to="/groups">자리</Link>
          <Link data-ph-capture-attribute-action="landing_nav_sparring" to="/sparring">토론하나?</Link>
          <Link data-ph-capture-attribute-action="landing_nav_games" to="/games">게임하나?</Link>
        </nav>
        <div className="landing-header__actions">
          <Link
            className="landing-button landing-button--mint landing-header__explore"
            data-ph-capture-attribute-action="landing_explore"
            to="/groups?recruiting=true"
          >
            모집 중인 모임 보기
          </Link>
          <LandingStartButton className="landing-button--quiet" />
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container landing-footer__inner">
        <nav aria-label="하단 메뉴" className="landing-footer__menus">
          <div className="landing-footer__menu">
            <p className="landing-footer__menu-title">서비스</p>
            <Link data-ph-capture-attribute-action="landing_footer_groups" to="/groups">자리 둘러보기</Link>
            <Link data-ph-capture-attribute-action="landing_footer_sparring" to="/sparring">토론하나?</Link>
            <Link data-ph-capture-attribute-action="landing_footer_games" to="/games">게임하나?</Link>
            <Link data-ph-capture-attribute-action="landing_footer_board" to="/board">자유게시판</Link>
          </div>
          <div className="landing-footer__menu">
            <p className="landing-footer__menu-title">자리하나?</p>
            <Link data-ph-capture-attribute-action="landing_tech_view" to="/land#tech">자리하나?를 만드는 방식</Link>
            <a
              data-ph-capture-attribute-action="landing_repository_open"
              href="https://github.com/woowacourse-teams/2026-jarihana"
              rel="noreferrer"
              target="_blank"
            >
              GitHub 저장소
            </a>
          </div>
        </nav>
        <div className="landing-footer__about">
          <p className="landing-footer__brand">
            <img alt="" height="28" src={logo} width="28" />
            자리하나?
          </p>
          <p>자리하나?는 우아한테크코스 크루들이 만들고 운영하는 모임 서비스예요.</p>
          <small>© {new Date().getFullYear()} 자리하나?</small>
        </div>
      </div>
    </footer>
  );
}

// 랜딩과 기능 소개 페이지가 함께 쓰는 머리글, 본문, 바닥글. 페이지를 옮기면 맨 위에서 시작한다.
export function LandingShell({ children, rootRef }) {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView?.();
      return;
    }
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="landing-page" id="landing-top" ref={rootRef}>
      <a className="skip-link" data-ph-capture-attribute-action="skip_to_content" href="#main-content">
        본문으로 건너뛰기
      </a>
      <LandingHeader />
      <main id="main-content" tabIndex="-1">
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
