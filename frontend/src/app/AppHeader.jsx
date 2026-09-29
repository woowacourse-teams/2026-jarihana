import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { storeReturnTarget, useAuth } from "../features/auth";
import {
  FeedbackForm,
  FeedbackLoginPrompt,
  getFeedbackReturnTarget
} from "../features/feedback/index.js";
import { Drawer, Modal, useToast } from "../shared/ui";
import githubMark from "../shared/assets/brand/github-mark.svg";
import logoMark from "../shared/assets/brand/jarihana-favicon.png";
import { ProfileMenu } from "./ProfileMenu";

const MEMBER_LINKS = [
  {
    isActive: (pathname) =>
      pathname === "/" ||
      pathname === "/groups" ||
      (pathname !== "/groups/new" && /^\/groups\/[^/]+(?:\/recruitments\/[^/]+)?$/.test(pathname)),
    label: "탐색",
    requiresAuth: false,
    to: "/groups"
  },
  {
    isActive: (pathname) => pathname === "/groups/new",
    label: "모임 만들기",
    requiresAuth: true,
    to: "/groups/new"
  }
];

const DESKTOP_MEMBER_LINKS = [];

function HeaderLinks({ links = MEMBER_LINKS, onNavigate, onProtectedNavigate, status }) {
  const { pathname } = useLocation();

  return links.map((link) => {
    const isActive = link.isActive(pathname);
    return (
      <Link
        aria-current={isActive ? "page" : undefined}
        className={isActive ? "app-header__link app-header__link--active" : "app-header__link"}
        key={link.to}
        onClick={(event) => {
          if (link.requiresAuth && status === "anonymous") {
            event.preventDefault();
            onProtectedNavigate(link.to);
          }
          onNavigate();
        }}
        to={link.to}
      >
        {link.label}
      </Link>
    );
  });
}

function MyPageLink({ onNavigate }) {
  const { pathname } = useLocation();
  const isActive = ["/my", "/my/groups", "/my/registrations"].includes(pathname);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      aria-label="마이페이지"
      className="app-header__link"
      data-ph-capture-attribute-action="my_page_view"
      onClick={onNavigate}
      to="/my"
    >
      마이페이지
    </Link>
  );
}

function FeedbackLink({ onClick, onNavigate, open, status }) {
  return (
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      className="app-header__link app-header__feedback-link"
      data-ph-capture-attribute-action="feedback_start"
      disabled={status === "loading"}
      onClick={() => {
        onNavigate?.();
        onClick(Boolean(onNavigate));
      }}
      type="button"
    >
      피드백 남기기
    </button>
  );
}

function AuthAction({ onNavigate, status }) {
  const { login, logout } = useAuth();

  if (status === "authenticated") {
    return (
      <button
        className="app-header__auth app-header__auth--secondary"
        data-ph-capture-attribute-action="logout"
        onClick={() => {
          onNavigate();
          void logout();
        }}
        type="button"
      >
        로그아웃
      </button>
    );
  }

  if (status === "loading") {
    return (
      <span aria-label="인증 확인 중" className="app-header__auth-placeholder" role="status" />
    );
  }

  if (status === "signup-required") {
    return (
      <Link
        className="app-header__auth"
        data-ph-capture-attribute-action="signup_continue"
        onClick={onNavigate}
        to="/signup"
      >
        가입 계속하기
      </Link>
    );
  }

  return (
    <button
      className="app-header__auth app-header__auth--github"
      data-ph-capture-attribute-action="login"
      onClick={() => {
        onNavigate();
        login();
      }}
      type="button"
    >
      <img alt="" aria-hidden="true" className="app-header__github-mark" src={githubMark} />
      GitHub로 로그인
    </button>
  );
}

export function AppHeader({ action = null, title = "" }) {
  const { login, status } = useAuth();
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const { success } = useToast();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [feedbackManuallyOpen, setFeedbackManuallyOpen] = useState(false);
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const menuButtonReference = useRef(null);
  const focusMenuAfterFeedbackReference = useRef(false);
  const hasFeedbackReturnIntent = new URLSearchParams(search).get("feedback") === "open";
  const feedbackOpen =
    feedbackManuallyOpen || (status === "authenticated" && hasFeedbackReturnIntent);
  const closeMenu = () => setMenuOpen(false);
  const redirectToLogin = (target) => {
    storeReturnTarget(target);
    login();
  };

  function handleLoginRequiredClose() {
    setLoginRequiredOpen(false);
    if (focusMenuAfterFeedbackReference.current) {
      focusMenuAfterFeedbackReference.current = false;
      requestAnimationFrame(() => menuButtonReference.current?.focus());
    }
  }

  function handleFeedbackLogin() {
    focusMenuAfterFeedbackReference.current = false;
    storeReturnTarget(getFeedbackReturnTarget({ hash, pathname, search }));
    setLoginRequiredOpen(false);
    login();
  }

  function handleFeedbackTrigger(fromMobileMenu) {
    if (status === "loading") return;

    if (status !== "authenticated") {
      if (status === "signup-required") {
        navigate("/signup");
        return;
      }
      focusMenuAfterFeedbackReference.current = fromMobileMenu;
      setLoginRequiredOpen(true);
      return;
    }
    focusMenuAfterFeedbackReference.current = fromMobileMenu;
    setFeedbackManuallyOpen(true);
  }

  function handleFeedbackOpenChange(open) {
    setFeedbackManuallyOpen(open);
    if (!open && hasFeedbackReturnIntent) {
      const searchParams = new URLSearchParams(search);
      searchParams.delete("feedback");
      const remainingSearch = searchParams.toString();
      navigate(
        { hash, pathname, search: remainingSearch ? `?${remainingSearch}` : "" },
        { replace: true }
      );
    }
    if (!open && focusMenuAfterFeedbackReference.current) {
      focusMenuAfterFeedbackReference.current = false;
      requestAnimationFrame(() => menuButtonReference.current?.focus());
    }
  }

  function handleFeedbackSuccess() {
    success({ title: "피드백을 보내드렸어요." });
    handleFeedbackOpenChange(false);
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand-group">
            <Link aria-label="자리하나 홈" className="app-header__brand" to="/groups">
              <img alt="" aria-hidden="true" className="app-header__brand-mark" src={logoMark} />
              <span className="app-header__brand-text">자리하나?</span>
            </Link>
          </div>

          <nav aria-label="주요 메뉴" className="app-header__primary-nav">
            <FeedbackLink
              onClick={handleFeedbackTrigger}
              open={feedbackOpen || loginRequiredOpen}
              status={status}
            />
            <HeaderLinks
              links={DESKTOP_MEMBER_LINKS}
              onNavigate={() => {}}
              onProtectedNavigate={redirectToLogin}
              status={status}
            />
          </nav>

          <div className="app-header__desktop-action">
            {title ? <span className="app-header__context">{title}</span> : null}
            {action}
            {status === "authenticated" ? (
              <ProfileMenu />
            ) : (
              <AuthAction onNavigate={() => {}} status={status} />
            )}
          </div>

          <div className="app-header__mobile-action">
            {status === "authenticated" ? <ProfileMenu /> : null}
            <button
              aria-expanded={isMenuOpen}
              aria-label="메뉴 열기"
              className="app-header__menu-button"
              data-ph-capture-attribute-action="header_menu_open"
              onClick={() => setMenuOpen(true)}
              ref={menuButtonReference}
              type="button"
            >
              <span aria-hidden="true" className="app-header__menu-lines" />
            </button>
          </div>
        </div>
      </header>

      <Modal
        onOpenChange={handleFeedbackOpenChange}
        open={feedbackOpen}
        title="피드백 남기기"
      >
        <FeedbackForm onSuccess={handleFeedbackSuccess} />
      </Modal>

      <FeedbackLoginPrompt
        onClose={handleLoginRequiredClose}
        onLogin={handleFeedbackLogin}
        open={loginRequiredOpen}
      />

      <Drawer onClose={closeMenu} open={isMenuOpen} title="전체 메뉴">
        <nav aria-label="모바일 메뉴" className="app-header__mobile-nav">
          {title ? <p className="app-header__context">{title}</p> : null}
          <FeedbackLink
            onClick={handleFeedbackTrigger}
            onNavigate={closeMenu}
            open={feedbackOpen || loginRequiredOpen}
            status={status}
          />
          <HeaderLinks
            onNavigate={closeMenu}
            onProtectedNavigate={redirectToLogin}
            status={status}
          />
          {status === "authenticated" ? <MyPageLink onNavigate={closeMenu} /> : null}
          {action}
          <AuthAction onNavigate={closeMenu} status={status} />
        </nav>
      </Drawer>
    </>
  );
}
