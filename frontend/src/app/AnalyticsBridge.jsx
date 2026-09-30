import { useLayoutEffect } from "react";
import { matchRoutes, useLocation } from "react-router";

import { useAuth } from "../features/auth";
import {
  captureEvent,
  getPromotionEntryId,
  setAnalyticsRoute,
  syncAnalyticsIdentity,
  syncPromotionAttribution,
  trackPage
} from "../shared/analytics";
import { consumeLoginCompletion } from "../shared/analytics/loginConversion";
import { routeRegistry } from "./routes";

export function AnalyticsBridge() {
  const { member, reload, status } = useAuth();
  const { pathname, search = "" } = useLocation();
  const memberId = member?.id;

  useLayoutEffect(() => {
    let cancelled = false;
    const match = matchRoutes(routeRegistry, pathname)?.at(-1);
    const isPromotionRoute = ["GroupDetailPage", "RecruitmentDetailPage"].includes(
      match?.route.page
    );
    const promotionId = isPromotionRoute ? getPromotionEntryId(search) : undefined;
    const routeProperties = {
      route_name: match?.route.page,
      group_id: match?.params.groupId,
      recruitment_id: match?.params.recruitmentId
    };
    if (promotionId) routeProperties.promotion_id = promotionId;
    setAnalyticsRoute(pathname, routeProperties);

    const synchronize = async () => {
      const ready = await syncAnalyticsIdentity(status, memberId);
      if (!cancelled && ready) {
        syncPromotionAttribution(match?.params.groupId, search);
        trackPage(pathname);
        if (status === "authenticated" && consumeLoginCompletion(memberId)) {
          captureEvent("login_completed", { provider: "github" });
        }
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
  }, [memberId, pathname, reload, search, status]);

  return null;
}
