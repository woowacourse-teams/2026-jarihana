import { NotificationBell, NotificationBellTrigger, NotificationDrawer } from "../features/notifications/NotificationInbox";
import { ChatLink } from "../features/chat/ChatLink";
import { useChatUnreadCount } from "../features/chat/useChatUnreadCount";
import { useId, useRef, useState } from "react";
import { useUnreadCount } from "../features/notifications/hooks";
import { Link, useLocation, useNavigate } from "react-router";
import { MessageCircle, UserRound } from "lucide-react";

import { storeReturnTarget, useAuth } from "../features/auth";
import {
  FeedbackForm,
  FeedbackLoginPrompt,
  getFeedbackReturnTarget
} from "../features/feedback/index.js";
import { nonCrewMemberTypeLabel } from "../entities/member/index.js";
import { COURSE_LABELS, generationLabel } from "../pages/account/accountUtils";
import { Avatar, Drawer, Modal, useToast } from "../shared/ui";
import githubMark from "../shared/assets/brand/github-mark.svg";
import logoMark from "../shared/assets/brand/jarihana-favicon.png";
import createChairImage from "../shared/assets/brand/jarihana-chair-create.png";
import { ProfileMenu } from "./ProfileMenu";

const HOME_LINK = {
  action: "group_home",
  isActive: (pathname) => pathname === "/home",
  label: "홈",
  requiresAuth: false,
  to: "/home"
};

const EXPLORE_LINK = {
  action: "group_browse",
  isActive: (pathname) => pathname === "/groups",
  label: "탐색",
  requiresAuth: false,
  to: "/groups"
};

const ACTIVITY_LINK = {
  action: "browse_activity_posts",
  isActive: (pathname) => pathname === "/activities",
  label: "활동",
  requiresAuth: false,
  to: "/activities"
};

const BOARD_LINK = {
  action: "browse_proposals",
  isActive: (pathname) => pathname === "/board" || pathname.startsWith("/board/"),
  label: "게시판",
  requiresAuth: false,
  to: "/board"
};

const MEMBER_LINKS = [
  HOME_LINK,
  EXPLORE_LINK,
  ACTIVITY_LINK,
  BOARD_LINK,
  {
    action: "group_create",
    isActive: (pathname) => pathname === "/groups/new",
    label: "모임 만들기",
    requiresAuth: true,
    to: "/groups/new"
  }
];

const DESKTOP_MEMBER_LINKS = [HOME_LINK, EXPLORE_LINK, ACTIVITY_LINK, BOARD_LINK];

function HeaderLinks({ links = MEMBER_LINKS, onNavigate, onProtectedNavigate, status }) {
  const { pathname } = useLocation();

  return links.map((link) => {
    const isActive = link.isActive(pathname);
    return (
      <Link
        aria-current={isActive ? "page" : undefined}
        className={isActive ? "app-header__link app-header__link--active" : "app-header__link"}
        data-ph-capture-attribute-action={link.action}
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
      className={isActive ? "app-header__link app-header__link--active" : "app-header__link"}
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
      피드백
    </button>
  );
}

function AuthAction({ onNavigate, status }) {
  const { login, logout, logoutPending } = useAuth();

  if (status === "authenticated") {
    return (
      <button
        className="app-header__auth app-header__auth--secondary"
        data-ph-capture-attribute-action="logout"
        disabled={logoutPending}
        onClick={() => {
          onNavigate();
          void Promise.resolve(logout()).catch(() => undefined);
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

function HeaderChatLink({ unread, mobile = false }) {
  return <ChatLink aria-label={`채팅${unread > 0 ? `, 안 읽은 메시지 ${unread}개` : ""}`} title="채팅"
    className={`app-header__chat${mobile ? " app-header__chat--mobile" : ""}`}
    data-ph-capture-attribute-action="chat_inbox_open">
    <MessageCircle aria-hidden="true" />
    {unread > 0 && <span className="app-header__chat-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
  </ChatLink>;
}

export function AppHeader({ action = null, onOpenPwaGuide, title = "" }) {
  const { avatarUrl, login, logout, logoutError, logoutPending, member, status } = useAuth();
  const unreadCount = useUnreadCount();
  const hasUnread = status === "authenticated" && unreadCount.data?.unreadCount > 0;
  const unreadDescriptionId = useId();
  const memberDetails = nonCrewMemberTypeLabel(member?.memberType)
    ?? `${generationLabel(member?.generation)}${member?.course ? ` / ${COURSE_LABELS[member.course]}` : ""}`;
  const { hash, pathname, search } = useLocation();
  const chatUnread = useChatUnreadCount();
  const activeMenuIndex = DESKTOP_MEMBER_LINKS.findIndex((link) => link.isActive(pathname));
  const navigate = useNavigate();
  const { success } = useToast();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isMobileNotificationOpen, setMobileNotificationOpen] = useState(false);
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

  function handleOpenPwaGuideFromInbox() {
    setMobileNotificationOpen(false);
    setMenuOpen(false);
    window.requestAnimationFrame(() => onOpenPwaGuide?.());
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand-group">
            <Link
              aria-label="자리하나 홈"
              className="app-header__brand"
              data-ph-capture-attribute-action="group_home"
              to="/home"
            >
              <img alt="" aria-hidden="true" className="app-header__brand-mark" src={logoMark} />
              <span className="app-header__brand-text">자리하나?</span>
            </Link>
          </div>

          <nav
            aria-label="주요 메뉴"
            className="app-header__primary-nav"
            data-active={activeMenuIndex >= 0}
            style={{ "--header-active-index": Math.max(0, activeMenuIndex) }}
          >
            <HeaderLinks
              links={DESKTOP_MEMBER_LINKS}
              onNavigate={() => {}}
              onProtectedNavigate={redirectToLogin}
              status={status}
            />
            <FeedbackLink
              onClick={handleFeedbackTrigger}
              open={feedbackOpen || loginRequiredOpen}
              status={status}
            />
          </nav>

          <div className="app-header__desktop-action">
            {title ? <span className="app-header__context">{title}</span> : null}
            {action}
            <Link
              className="app-header__auth app-header__create"
              data-ph-capture-attribute-action="group_create"
              onClick={(event) => {
                if (status === "anonymous") {
                  event.preventDefault();
                  redirectToLogin("/groups/new");
                }
              }}
              to="/groups/new"
            >
              <img
                alt=""
                aria-hidden="true"
                className="app-header__create-chair"
                height="24"
                src={createChairImage}
                width="24"
              />
              자리 만들기
            </Link>
            {status === "authenticated" && <HeaderChatLink unread={chatUnread} />}
            {status === "authenticated" ? (
              <div className="notification-header-actions"><NotificationBell onOpenPwaGuide={onOpenPwaGuide} /><ProfileMenu /></div>
            ) : (
              <AuthAction onNavigate={() => {}} status={status} />
            )}
          </div>

          {status === "authenticated" && <HeaderChatLink unread={chatUnread} mobile />}
          <button
            aria-expanded={isMenuOpen}
            aria-label="메뉴 열기"
            aria-describedby={hasUnread ? unreadDescriptionId : undefined}
            className="app-header__menu-button"
            data-ph-capture-attribute-action="header_menu_open"
            onClick={() => setMenuOpen(true)}
            ref={menuButtonReference}
            type="button"
          >
            <span aria-hidden="true" className="app-header__menu-lines" />
            {hasUnread ? <>
              <span aria-hidden="true" className="app-header__unread-dot" />
              <span className="ui-sr-only" id={unreadDescriptionId}>안 읽은 알림이 있어요.</span>
            </> : null}
          </button>
        </div>
      </header>

      {logoutError ? <div className="notification-logout-error" role="alert"><p>{logoutError}</p>
        <button data-ph-capture-attribute-action={status === "authenticated" ? "logout_retry" : "login_retry"} disabled={logoutPending}
          onClick={() => { if (status === "authenticated") void logout().catch(() => undefined); else login(); }} type="button">
          {status === "authenticated" ? "로그아웃 재시도" : "로그인 재시도"}
        </button>
      </div> : null}
      <Modal
        closeAction="feedback_form_dismiss"
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

      <Drawer
        closeAction="mobile_menu_dismiss"
        headerActions={status === "authenticated" ? <NotificationBellTrigger onClick={() => {
          closeMenu();
          menuButtonReference.current?.focus();
          setMobileNotificationOpen(true);
        }} /> : null}
        onClose={closeMenu}
        open={isMenuOpen}
        title="전체 메뉴"
      >
        <nav aria-label="모바일 메뉴" className="app-header__mobile-nav">
          {title ? <p className="app-header__context">{title}</p> : null}
          <div className="app-header__mobile-account">
            <div className="app-header__mobile-identity">
              {status !== "anonymous" ? (
                <span className="app-header__mobile-eyebrow">나의 프로필</span>
              ) : null}
              {status === "authenticated" ? (
                <Avatar
                  alt=""
                  className="app-header__avatar"
                  fallback={member?.crewName?.slice(0, 1) || "?"}
                  size="sm"
                  src={avatarUrl ?? member?.avatarUrl}
                />
              ) : (
                <span aria-hidden="true" className="app-header__avatar app-header__guest-avatar">
                  <UserRound />
                </span>
              )}
              {status === "anonymous" ? (
                <p className="app-header__mobile-member app-header__mobile-guest-copy">
                  게스트
                </p>
              ) : (
                <div className="app-header__mobile-member">
                  <strong className="app-header__mobile-name">
                    {status === "authenticated" ? member?.crewName
                      : status === "loading" ? "잠시만 기다려 주세요"
                        : "가입을 마무리해 주세요"}
                  </strong>
                  <span className="app-header__mobile-generation">
                    {status === "authenticated" ? memberDetails
                      : status === "loading" ? "내 계정 정보를 확인하고 있어요"
                        : "프로필을 완성하고 모임에 참여해요"}
                  </span>
                </div>
              )}
            </div>
            <AuthAction onNavigate={closeMenu} status={status} />
          </div>
          <div className="app-header__mobile-links">
            <h3 className="app-header__mobile-section-title">메뉴</h3>
            <HeaderLinks
              onNavigate={closeMenu}
              onProtectedNavigate={redirectToLogin}
              status={status}
            />
            <FeedbackLink
              onClick={handleFeedbackTrigger}
              onNavigate={closeMenu}
              open={feedbackOpen || loginRequiredOpen}
              status={status}
            />
            {status === "authenticated" ? <MyPageLink onNavigate={closeMenu} /> : null}
            {status === "authenticated" && <ChatLink className="app-header__link" onClick={closeMenu} data-ph-capture-attribute-action="chat_inbox_open">채팅</ChatLink>}
            {action}
          </div>
        </nav>
      </Drawer>
      {status === "authenticated" ? <NotificationDrawer open={isMobileNotificationOpen} onOpenChange={(open) => {
        setMobileNotificationOpen(open);
        if (!open) {
          menuButtonReference.current?.focus();
          setMenuOpen(true);
        }
      }} onOpenNotification={() => setMobileNotificationOpen(false)} onOpenPwaGuide={handleOpenPwaGuideFromInbox} /> : null}
    </>
  );
}
