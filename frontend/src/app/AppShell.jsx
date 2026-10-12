import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";

import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import "./AppShell.css";

const PRIMARY_PAGE_PATHS = ["/", "/groups", "/activities"];

function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
}

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setVisible(window.scrollY > 0);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!visible) return null;

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
  const { pathname } = useLocation();
  const pageReference = useRef(null);
  const previousPathname = useRef(pathname);

  useLayoutEffect(() => {
    const previousIndex = PRIMARY_PAGE_PATHS.indexOf(previousPathname.current);
    const nextIndex = PRIMARY_PAGE_PATHS.indexOf(pathname);
    previousPathname.current = pathname;
    const page = pageReference.current;
    if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) return;
    if (!page?.animate || !window.matchMedia?.("(prefers-reduced-motion: no-preference)")?.matches) return;

    const direction = nextIndex > previousIndex ? 1 : -1;
    const styles = getComputedStyle(page);
    const animation = page.animate(
      [
        { opacity: 0, transform: `translateX(calc(var(--page-slide-distance) * ${direction}))` },
        { opacity: 1, transform: "translateX(0)" }
      ],
      {
        duration: Number.parseFloat(styles.getPropertyValue("--duration-smooth")),
        easing: styles.getPropertyValue("--ease-standard").trim()
      }
    );
    return () => animation.cancel();
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <AppHeader action={headerAction} title={headerTitle} />

      <main id="main-content" tabIndex="-1">
        <div className="app-page-content" ref={pageReference}>
          {children ?? <Outlet />}
        </div>
      </main>

      <AppFooter />
      <ScrollToTopButton />
    </div>
  );
}
