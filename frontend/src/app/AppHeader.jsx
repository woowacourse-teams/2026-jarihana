import { useState } from "react";
import { Link, useLocation } from "react-router";

import { storeReturnTarget, useAuth } from "../features/auth";
import { Drawer, useToast } from "../shared/ui";

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

function HeaderLinks({ onNavigate, onProtectedNavigate, status }) {
  const { pathname } = useLocation();

  return MEMBER_LINKS.map((link) => {
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
  const isActive =
    pathname === "/my" || pathname === "/my/groups" || pathname === "/my/registrations";

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={isActive ? "app-header__link app-header__link--active" : "app-header__link"}
      onClick={onNavigate}
      to="/my"
    >
      마이페이지
    </Link>
  );
}

function AuthAction({ onNavigate, status }) {
  const { developmentLoginAvailable, login, logout } = useAuth();

  if (status === "authenticated") {
    return (
      <button
        className="app-header__auth app-header__auth--secondary"
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
      <Link className="app-header__auth" onClick={onNavigate} to="/signup">
        가입 계속하기
      </Link>
    );
  }

  return (
    <button
      className="app-header__auth"
      onClick={() => {
        onNavigate();
        login();
      }}
      type="button"
    >
      {developmentLoginAvailable ? "개발 계정으로 시작" : "GitHub로 로그인"}
    </button>
  );
}

export function AppHeader({ action = null, title = "" }) {
  const { status } = useAuth();
  const toast = useToast();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const explainProtectedNavigation = (target) => {
    storeReturnTarget(target);
    toast.warning({
      description: "로그인한 뒤 이용할 수 있어요",
      title: "로그인이 필요한 메뉴예요"
    });
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link aria-label="자리하나 홈" className="app-header__brand" to="/groups">
            자리 하나<span aria-hidden="true">?</span>
          </Link>

          <nav aria-label="주요 메뉴" className="app-header__desktop-nav">
            <HeaderLinks
              onNavigate={() => {}}
              onProtectedNavigate={explainProtectedNavigation}
              status={status}
            />
          </nav>

          <div className="app-header__desktop-action">
            {title ? <span className="app-header__context">{title}</span> : null}
            {action}
            {status === "authenticated" ? <MyPageLink onNavigate={() => {}} /> : null}
            <AuthAction onNavigate={() => {}} status={status} />
          </div>

          <button
            aria-expanded={isMenuOpen}
            aria-label="메뉴 열기"
            className="app-header__menu-button"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            <span aria-hidden="true" className="app-header__menu-lines" />
          </button>
        </div>
      </header>

      <Drawer onClose={closeMenu} open={isMenuOpen} title="전체 메뉴">
        <nav aria-label="모바일 메뉴" className="app-header__mobile-nav">
          {title ? <p className="app-header__context">{title}</p> : null}
          <HeaderLinks
            onNavigate={closeMenu}
            onProtectedNavigate={explainProtectedNavigation}
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
