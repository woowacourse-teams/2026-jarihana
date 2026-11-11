import { useState } from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";

import { useInfiniteActivityPosts } from "../../features/activity-post/hooks.js";
import { useAnnouncementDetail, useAnnouncementList } from "../../features/announcement/hooks.js";
import { ClubhouseContentDialog } from "./ClubhouseContentDialog.jsx";
import { useClubhouseContent } from "./useClubhouseContent.js";

jest.mock("../../features/activity-post/hooks.js", () => ({ useInfiniteActivityPosts: jest.fn() }));
jest.mock("../../features/announcement/hooks.js", () => ({ useAnnouncementDetail: jest.fn(), useAnnouncementList: jest.fn() }));

const post = {
  id: 7, caption: "함께 한 홀드", imageUrl: "/images/climbing.jpg", activityDate: "2026-11-09",
  createdAt: "2026-11-09T10:00:00", authorNickname: "파도"
};
const notice = { id: 3, title: "이번 주 일정", scope: "PUBLIC", authorNickname: "파도" };
const guest = { status: "anonymous", member: null, sessionVersion: 0 };

function query(items, extra = {}) {
  return {
    data: { pages: [{ items }] }, isPending: false, isError: false, isFetching: false,
    hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(), ...extra
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useInfiniteActivityPosts.mockReturnValue(query([post]));
  useAnnouncementList.mockReturnValue(query([notice]));
  useAnnouncementDetail.mockReturnValue({ data: { ...notice, content: "토요일 오후에 만나요." } });
});

test("public activity and announcement feeds supply the exhibit with canonical detail links", () => {
  const { result } = renderHook(() => useClubhouseContent(11, guest));
  expect(useInfiniteActivityPosts).toHaveBeenCalledWith({ groupId: 11, viewerKey: "anonymous", enabled: true });
  expect(useAnnouncementList).toHaveBeenCalledWith(11, undefined, 0, true);
  expect(result.current.exhibit).toEqual({ status: "ready", records: [{
    id: 7, title: "함께 한 홀드", content: "함께 한 홀드", photo: "/images/climbing.jpg",
    createdAt: post.createdAt, activityDate: post.activityDate, author: { name: "파도" },
    link: "/groups/11?tab=activities&post=7"
  }] });
  expect(result.current.announcements.records).toEqual([notice]);
});

test("saved frames load older pages of the same feed and stop once the record is found", () => {
  const feed = query([post], { hasNextPage: true });
  useInfiniteActivityPosts.mockReturnValue(feed);
  const { rerender } = renderHook(() => useClubhouseContent(11, guest, [99]));
  expect(feed.fetchNextPage).toHaveBeenCalledTimes(1);
  feed.fetchNextPage.mockClear();
  useInfiniteActivityPosts.mockReturnValue(query([post, { ...post, id: 99 }], {
    hasNextPage: true, fetchNextPage: feed.fetchNextPage
  }));
  rerender();
  expect(feed.fetchNextPage).not.toHaveBeenCalled();
});

test("authorization failures clear previously loaded notice titles and photos", () => {
  useInfiniteActivityPosts.mockReturnValue(query([post], { isError: true, error: { status: 401 } }));
  useAnnouncementList.mockReturnValue(query([notice], { isError: true, error: { status: 401 } }));
  const { result } = renderHook(() => useClubhouseContent(11, { ...guest, status: "authenticated", member: { id: 2 }, sessionVersion: 4 }));
  expect(result.current.exhibit).toEqual({ status: "denied", records: [] });
  expect(result.current.announcements).toEqual({ status: "denied", records: [] });
  expect(useAnnouncementList).toHaveBeenCalledWith(11, 2, 4, true);
});

function renderDialog(props = {}) {
  const onOpen = jest.fn();
  const onDisplayRecord = jest.fn();
  const exhibit = { status: "ready", records: [{
    id: 7, title: post.caption, photo: post.imageUrl, createdAt: post.createdAt,
    link: "/groups/11?tab=activities&post=7"
  }] };
  render(<ClubhouseContentDialog selection={{ feature: "activities", recordId: "7" }} groupId={11} auth={guest}
    exhibit={exhibit} announcements={{ status: "ready", records: [notice] }}
    onRetry={jest.fn()} onRetryAnnouncements={jest.fn()} onClose={jest.fn()} onSelect={jest.fn()}
    onOpen={onOpen} onDisplayRecord={onDisplayRecord} {...props} />);
  return { onOpen, onDisplayRecord, exhibit };
}

test("a frame opens the actual activity post and offers its record to the decoration host", () => {
  const { onOpen, onDisplayRecord, exhibit } = renderDialog();
  expect(screen.getByRole("img", { name: post.caption })).toHaveAttribute("src", post.imageUrl);
  fireEvent.click(screen.getByRole("button", { name: "웹에서 이 기록 보기" }));
  expect(onOpen).toHaveBeenCalledWith("activities", { link: "/groups/11?tab=activities&post=7" });
  fireEvent.click(screen.getByRole("button", { name: "이 사진을 액자에 전시" }));
  expect(onDisplayRecord).toHaveBeenCalledWith(exhibit.records[0]);
});

test("a broken image leaves the record accessible in the modal", () => {
  renderDialog();
  fireEvent.error(screen.getByRole("img", { name: post.caption }));
  expect(screen.getByText("사진을 불러오지 못했어요.")).toBeVisible();
  expect(screen.getByRole("heading", { name: post.caption })).toBeVisible();
  expect(screen.getByRole("button", { name: "웹에서 이 기록 보기" })).toBeVisible();
});

test("a public announcement opens in the modal and can still be opened on the web", () => {
  const { onOpen } = renderDialog({ selection: { feature: "dashboard" }, onDisplayRecord: undefined });
  expect(screen.getByRole("dialog", { name: "모임 소식·추억" })).toHaveAttribute("aria-modal", "true");
  fireEvent.click(screen.getByRole("button", { name: /이번 주 일정/ }));
  expect(useAnnouncementDetail).toHaveBeenCalledWith(11, "3", undefined, 0, true);
  expect(screen.getByText("토요일 오후에 만나요.")).toBeVisible();
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "웹에서 이 공지 보기" }));
  expect(onOpen).toHaveBeenCalledWith("announcements", { link: "/groups/11/announcements/3" });
});

test("a revoked announcement hides its body and link even if a cached response exists", () => {
  useAnnouncementDetail.mockReturnValue({ data: { ...notice, content: "비공개 내용" }, isError: true, error: { status: 404 } });
  renderDialog({ selection: { feature: "dashboard" } });
  fireEvent.click(screen.getByRole("button", { name: /이번 주 일정/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("현재 계정으로 볼 수 없는 공지");
  expect(screen.queryByText("비공개 내용")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "웹에서 이 공지 보기" })).not.toBeInTheDocument();
});

test("the modal switches views and Escape returns focus to the opener", () => {
  function DialogHost() {
    const [selection, setSelection] = useState(null);
    return (
      <>
        <button onClick={() => setSelection({ feature: "dashboard" })}>소식 열기</button>
        <ClubhouseContentDialog selection={selection} groupId={11} auth={guest}
          announcements={{ status: "ready", records: [notice] }} exhibit={{ status: "ready", records: [] }}
          onSelect={(feature) => setSelection({ feature })} onClose={() => setSelection(null)} />
      </>
    );
  }
  const { container } = render(<DialogHost />);
  const opener = screen.getByRole("button", { name: "소식 열기" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog");
  expect(container).not.toContainElement(dialog);
  expect(screen.getByRole("button", { name: "모임 소식·추억 닫기" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "활동 기록" }));
  expect(screen.getByText("아직 등록된 활동 사진이 없어요.")).toBeVisible();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test("a deleted or unavailable pinned photo is not replaced with a different photo", () => {
  renderDialog({ selection: { feature: "activities", recordId: 99 }, onDisplayRecord: undefined });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/이 활동 사진을 찾을 수 없어요/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "이 사진을 액자에 전시" })).not.toBeInTheDocument();
});
