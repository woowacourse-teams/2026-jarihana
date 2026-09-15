import { useLayoutEffect } from "react";
import { matchRoutes, useLocation } from "react-router";

import { useAuth } from "../features/auth";
import { setAnalyticsRoute, syncAnalyticsIdentity, trackPage } from "../shared/analytics";
import { routeRegistry } from "./routes";

export function AnalyticsBridge() {
  const { member, reload, status } = useAuth();
  const { pathname } = useLocation();
  const memberId = member?.id;

  useLayoutEffect(() => {
    let cancelled = false;
    const match = matchRoutes(routeRegistry, pathname)?.at(-1);
    setAnalyticsRoute(pathname, {
      route_name: match?.route.page,
      group_id: match?.params.groupId,
      recruitment_id: match?.params.recruitmentId
    });

    const synchronize = async () => {
      const ready = await syncAnalyticsIdentity(status, memberId);
      if (!cancelled && ready) {
        trackPage(pathname);
      }
    };

    const handleStorage = (event) => {
      if (
        !event.key?.startsWith("jarihana.analytics.member.") ||
        event.oldValue === event.newValue
      ) {
        return;
      }
      cancelled = true;
      void syncAnalyticsIdentity("loading").catch(() => undefined);
      if (typeof reload === "function") {
        void reload().catch(() => undefined);
      }
    };

    window.addEventListener("storage", handleStorage);
    void synchronize().catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, [memberId, pathname, reload, status]);

  return null;
}
