import { Outlet } from "react-router";

import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import "./AppShell.css";

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
    </div>
  );
}
