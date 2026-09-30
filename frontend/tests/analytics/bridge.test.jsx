import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { matchRoutes, useLocation } from "react-router";

import { AnalyticsBridge } from "../../src/app/AnalyticsBridge";
import { routeRegistry } from "../../src/app/routes";
import { useAuth } from "../../src/features/auth";
import {
  captureEvent,
  getPromotionEntryId,
  setAnalyticsRoute,
  syncAnalyticsIdentity,
  syncPromotionAttribution,
  trackPage
} from "../../src/shared/analytics";
import { beginLoginAttempt, finishLoginAttempt } from "../../src/shared/analytics/loginConversion";

jest.mock("react-router", () => ({
  matchRoutes: jest.fn(),
  useLocation: jest.fn()
}));
jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/shared/analytics", () => ({
  getPromotionEntryId: jest.fn(),
  captureEvent: jest.fn(),
  setAnalyticsRoute: jest.fn(),
  syncAnalyticsIdentity: jest.fn(),
  syncPromotionAttribution: jest.fn(),
  trackPage: jest.fn()
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  getPromotionEntryId.mockReset().mockReturnValue(undefined);
  syncAnalyticsIdentity.mockReset().mockResolvedValue(true);
  syncPromotionAttribution.mockReset().mockReturnValue(undefined);
  useAuth.mockReturnValue({ member: { id: 42 }, status: "authenticated" });
  useLocation.mockReturnValue({ pathname: "/groups", search: "", hash: "" });
  matchRoutes.mockReturnValue([{ route: { page: "GroupsPage" }, params: {} }]);
});

test("records verified login once after identity settles, including StrictMode and navigation", async () => {
  beginLoginAttempt();
  finishLoginAttempt("authenticated", 42);
  const identity = deferred();
  syncAnalyticsIdentity.mockReturnValue(identity.promise);
  const { rerender, unmount } = render(
    <StrictMode>
      <AnalyticsBridge />
    </StrictMode>
  );
  expect(captureEvent).not.toHaveBeenCalled();
  await act(async () => identity.resolve(true));
  expect(captureEvent).toHaveBeenCalledTimes(1);
  expect(captureEvent).toHaveBeenCalledWith("login_completed", { provider: "github" });
  useLocation.mockReturnValue({ pathname: "/my" });
  rerender(
    <StrictMode>
      <AnalyticsBridge />
    </StrictMode>
  );
  await act(async () => {});
  unmount();
  render(<AnalyticsBridge />);
  await act(async () => {});
  expect(captureEvent).toHaveBeenCalledTimes(1);
});

test("regular authenticated visits do not count as login", async () => {
  render(<AnalyticsBridge />);
  await act(async () => {});
  expect(captureEvent).not.toHaveBeenCalled();
});

test("paused callback collection waits for an active destination before counting login", async () => {
  beginLoginAttempt();
  finishLoginAttempt("authenticated", 42);
  useLocation.mockReturnValue({ pathname: "/oauth/callback" });
  syncAnalyticsIdentity.mockResolvedValue(false);
  const { rerender } = render(<AnalyticsBridge />);
  await act(async () => {});
  expect(captureEvent).not.toHaveBeenCalled();
  useLocation.mockReturnValue({ pathname: "/groups" });
  syncAnalyticsIdentity.mockResolvedValue(true);
  rerender(<AnalyticsBridge />);
  await waitFor(() => expect(captureEvent).toHaveBeenCalledTimes(1));
});

test("synchronizes member identity before recording a page without exposing profile fields", async () => {
  const identity = deferred();
  syncAnalyticsIdentity.mockReturnValue(identity.promise);
  useAuth.mockReturnValue({
    member: { crewName: "private name", email: "private@example.com", id: 42 },
    status: "authenticated"
  });

  render(<AnalyticsBridge />);

  expect(setAnalyticsRoute).toHaveBeenCalledWith(
    "/groups",
    expect.objectContaining({ route_name: "GroupsPage" })
  );
  expect(syncAnalyticsIdentity).toHaveBeenCalledWith("authenticated", 42);
  expect(trackPage).not.toHaveBeenCalled();
  await act(async () => identity.resolve(true));
  expect(trackPage).toHaveBeenCalledWith("/groups");
});

test("sets the OAuth route boundary before identity synchronization and excludes URL parameters", async () => {
  matchRoutes.mockReturnValue([{ route: { page: "OAuthCallbackPage" }, params: {} }]);
  useLocation.mockReturnValue({
    hash: "#access_token=private",
    pathname: "/oauth/callback",
    search: "?code=private&state=private"
  });
  syncAnalyticsIdentity.mockResolvedValue(false);

  render(<AnalyticsBridge />);

  expect(setAnalyticsRoute).toHaveBeenCalledWith(
    "/oauth/callback",
    expect.objectContaining({ route_name: "OAuthCallbackPage" })
  );
  expect(setAnalyticsRoute.mock.invocationCallOrder[0]).toBeLessThan(
    syncAnalyticsIdentity.mock.invocationCallOrder[0]
  );
  await act(async () => {});
  expect(trackPage).not.toHaveBeenCalled();
});

test("uses route registry names and explicit group and recruitment IDs for context", async () => {
  matchRoutes.mockReturnValue([
    { route: { page: "RegistrationManagePage" }, params: { groupId: "12", recruitmentId: "34" } }
  ]);
  useLocation.mockReturnValue({ pathname: "/groups/12/manage/recruitments/34/registrations" });
  render(<AnalyticsBridge />);
  expect(matchRoutes).toHaveBeenCalledWith(
    routeRegistry,
    "/groups/12/manage/recruitments/34/registrations"
  );
  expect(setAnalyticsRoute).toHaveBeenCalledWith(
    "/groups/12/manage/recruitments/34/registrations",
    {
      route_name: "RegistrationManagePage",
      group_id: "12",
      recruitment_id: "34"
    }
  );
  await act(async () => {});
});

test("adds only the current URL's validated promotion identifier to group route context", async () => {
  matchRoutes.mockReturnValue([{ route: { page: "GroupDetailPage" }, params: { groupId: "13" } }]);
  useLocation.mockReturnValue({
    pathname: "/groups/13",
    search: "?promotion_id=second_campaign"
  });
  getPromotionEntryId.mockReturnValue("second_campaign");
  syncPromotionAttribution.mockReturnValue({
    group_id: "13",
    promotion_id: "first_campaign"
  });

  render(<AnalyticsBridge />);

  expect(getPromotionEntryId).toHaveBeenCalledWith("?promotion_id=second_campaign");
  expect(setAnalyticsRoute).toHaveBeenCalledWith("/groups/13", {
    route_name: "GroupDetailPage",
    group_id: "13",
    recruitment_id: undefined,
    promotion_id: "second_campaign"
  });
  await act(async () => {});
  expect(syncPromotionAttribution).toHaveBeenCalledWith("13", "?promotion_id=second_campaign");
});

test("does not attach a stored conversion attribution to a general group pageview", async () => {
  matchRoutes.mockReturnValue([{ route: { page: "GroupDetailPage" }, params: { groupId: "13" } }]);
  useLocation.mockReturnValue({ pathname: "/groups/13", search: "" });
  syncPromotionAttribution.mockReturnValue({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });

  render(<AnalyticsBridge />);

  expect(setAnalyticsRoute).toHaveBeenCalledWith("/groups/13", {
    route_name: "GroupDetailPage",
    group_id: "13",
    recruitment_id: undefined
  });
  await act(async () => {});
  expect(syncPromotionAttribution).toHaveBeenCalledWith("13", "");
});

test.each(["loading", "unavailable", "anonymous", "signup-required"])(
  "forwards the %s state to the identity boundary without recording when collection is paused",
  async (status) => {
    useAuth.mockReturnValue({ member: null, status });
    syncAnalyticsIdentity.mockResolvedValue(false);

    render(<AnalyticsBridge />);

    await waitFor(() => expect(syncAnalyticsIdentity).toHaveBeenCalledWith(status, undefined));
    expect(trackPage).not.toHaveBeenCalled();
  }
);

test("does not record stale identity completion after a rapid route and account change", async () => {
  const previousIdentity = deferred();
  const currentIdentity = deferred();
  syncAnalyticsIdentity
    .mockReturnValueOnce(previousIdentity.promise)
    .mockReturnValueOnce(currentIdentity.promise);
  const { rerender } = render(<AnalyticsBridge />);

  useLocation.mockReturnValue({ pathname: "/my", search: "", hash: "" });
  useAuth.mockReturnValue({ member: { id: 99 }, status: "authenticated" });
  rerender(<AnalyticsBridge />);

  expect(syncAnalyticsIdentity).toHaveBeenLastCalledWith("authenticated", 99);
  expect(trackPage).not.toHaveBeenCalled();
  await act(async () => previousIdentity.resolve(true));
  expect(trackPage).not.toHaveBeenCalled();
  await act(async () => currentIdentity.resolve(true));
  expect(trackPage).toHaveBeenCalledTimes(1);
  expect(trackPage).toHaveBeenCalledWith("/my");
});

test("does not record a stale route after an in-flight identity synchronization completes", async () => {
  const identity = deferred();
  syncAnalyticsIdentity.mockReturnValueOnce(identity.promise).mockResolvedValue(true);
  const { rerender } = render(<AnalyticsBridge />);
  await waitFor(() => expect(syncAnalyticsIdentity).toHaveBeenCalledTimes(1));

  useLocation.mockReturnValue({ pathname: "/my", search: "", hash: "" });
  rerender(<AnalyticsBridge />);
  await waitFor(() => expect(trackPage).toHaveBeenCalledWith("/my"));
  await act(async () => identity.resolve(true));

  expect(trackPage).toHaveBeenCalledTimes(1);
});

test("records only the active effect when StrictMode restarts synchronization", async () => {
  render(
    <StrictMode>
      <AnalyticsBridge />
    </StrictMode>
  );

  await waitFor(() => expect(trackPage).toHaveBeenCalledTimes(1));
  expect(syncAnalyticsIdentity).toHaveBeenCalledWith("authenticated", 42);
});

test("does not delay rendering or propagate rejected analytics synchronization", async () => {
  syncAnalyticsIdentity.mockRejectedValue(new Error("analytics blocked"));

  render(
    <>
      <AnalyticsBridge />
      <p>서비스 화면</p>
    </>
  );

  expect(screen.getByText("서비스 화면")).toBeInTheDocument();
  await act(async () => {});
  expect(trackPage).not.toHaveBeenCalled();
});

test("does not record a page after the bridge unmounts", async () => {
  const identity = deferred();
  syncAnalyticsIdentity.mockReturnValue(identity.promise);
  const { unmount } = render(<AnalyticsBridge />);
  await waitFor(() => expect(syncAnalyticsIdentity).toHaveBeenCalledTimes(1));

  unmount();
  await act(async () => identity.resolve(true));

  expect(trackPage).not.toHaveBeenCalled();
});

test("pauses identity and reloads authentication before collecting after another tab changes account", async () => {
  const identity = deferred();
  const reload = jest.fn().mockResolvedValue(undefined);
  useAuth.mockReturnValue({ member: { id: 42 }, reload, status: "authenticated" });
  syncAnalyticsIdentity.mockReturnValueOnce(identity.promise).mockResolvedValue(false);
  render(<AnalyticsBridge />);

  await act(async () => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "jarihana.analytics.member.phc_test",
        newValue: "99",
        oldValue: "42"
      })
    );
    identity.resolve(true);
  });

  expect(syncAnalyticsIdentity).toHaveBeenLastCalledWith("loading");
  expect(reload).toHaveBeenCalledTimes(1);
  expect(syncAnalyticsIdentity.mock.invocationCallOrder[1]).toBeLessThan(
    reload.mock.invocationCallOrder[0]
  );
  expect(trackPage).not.toHaveBeenCalled();
});

test.each([
  { key: "unrelated", newValue: "99", oldValue: "42" },
  { key: "jarihana.analytics.member.phc_test", newValue: "42", oldValue: "42" }
])("ignores unrelated or unchanged storage markers: %j", async (event) => {
  const reload = jest.fn().mockResolvedValue(undefined);
  useAuth.mockReturnValue({ member: { id: 42 }, reload, status: "authenticated" });
  render(<AnalyticsBridge />);
  await waitFor(() => expect(trackPage).toHaveBeenCalledTimes(1));

  await act(async () => window.dispatchEvent(new StorageEvent("storage", event)));

  expect(syncAnalyticsIdentity).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
});

test("handles a failed cross-tab authentication reload and removes its listener on unmount", async () => {
  const reload = jest.fn().mockRejectedValue(new Error("offline"));
  useAuth.mockReturnValue({ member: { id: 42 }, reload, status: "authenticated" });
  const { unmount } = render(<AnalyticsBridge />);
  const event = { key: "jarihana.analytics.member.phc_test", oldValue: "42", newValue: null };

  await act(async () => window.dispatchEvent(new StorageEvent("storage", event)));
  expect(reload).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => window.dispatchEvent(new StorageEvent("storage", event)));

  expect(reload).toHaveBeenCalledTimes(1);
});
