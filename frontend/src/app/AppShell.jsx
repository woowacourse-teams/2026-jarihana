import { Outlet } from "react-router";

import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import "./AppShell.css";

function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
}

function ScrollToTopButton() {
  function handleScrollToTop() {
    window.scrollTo({ behavior: scrollBehavior(), top: 0 });
  }

  return (
    <button
      aria-label="맨 위로 이동"
      className="app-scroll-top"
      onClick={handleScrollToTop}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m6 14 6-6 6 6" />
      </svg>
    </button>
  );
}

export function AppShell({ children, headerAction = null, headerTitle = "" }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <AppHeader action={headerAction} title={headerTitle} />

      <main id="main-content" tabIndex="-1">
        {children ?? <Outlet />}
      </main>

      <AppFooter />
      <ScrollToTopButton />
    </div>
  );
}
