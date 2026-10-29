import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SparringPage from "../../src/pages/sparring/SparringPage.jsx";
import { remainingDeadline } from "../../src/pages/sparring/sparringDeadline.js";
import { addDateDays, formatDateLabel, formatEndpointDate, monthStart } from "../../src/shared/ui/dateRangeUtils.js";
import { useAuth } from "../../src/features/auth";
import { createSparring, listSparrings } from "../../src/features/sparring/api";
import { uploadImage } from "../../src/features/image-upload";

const mockNavigate = jest.fn();
jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate
}));
jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn(), storeReturnTarget: jest.fn() }));
jest.mock("../../src/features/sparring/api", () => ({
  listSparrings: jest.fn(),
  createSparring: jest.fn()
}));
jest.mock("../../src/features/image-upload", () => ({
  ...jest.requireActual("../../src/features/image-upload"),
  uploadImage: jest.fn()
}));
const topic = {
  id: 3,
  title: "점심 20분 기다릴까?",
  a: "맛있으면 기다려",
  b: "시간이 더 소중해",
  votesA: 22,
  votesB: 9,
  postCount: 4
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const endOfDay = (date) => new Date(`${date}T23:59:59.999+09:00`).toISOString();
const page = (items = [topic]) => ({ items, nextCursor: null, hasNext: false });
it("formats the remaining deadline without inventing dates for older topics", () => {
  const now = Date.parse("2026-10-29T00:00:00Z");
  const after = (seconds) => new Date(now + seconds * 1000).toISOString();
  expect(remainingDeadline(after(7 * 86400), now)).toBe("D-7");
  expect(remainingDeadline(after(86401), now)).toBe("D-2");
  expect(remainingDeadline(after(86399), now)).toBe("23시간 59분 남음");
  expect(remainingDeadline(after(59), now)).toBe("0분 59초 남음");
  expect(remainingDeadline(after(1), now)).toBe("0분 1초 남음");
  expect(remainingDeadline(after(0), now)).toBe("마감");
  expect(remainingDeadline(null, now)).toBe("마감일 없음");
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SparringPage />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:photo-preview");
  URL.revokeObjectURL = jest.fn();
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 1 }, login: jest.fn() });
  listSparrings.mockImplementation(async ({ filter }) => page(filter.startsWith("closed") ? [{ ...topic, id: 4, title: "마감된 점심 토론", closesAt: "2020-01-01T00:00:00Z" }] : [topic]));
});
it("shows the introduction even when there are no open discussions", async () => {
  listSparrings.mockResolvedValue(page([]));
  mount();
  expect(screen.getByRole("heading", { name: "토론해요", level: 1 })).toBeInTheDocument();
  expect(screen.getByText("누구 말이 맞을까?")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "토론 만들기" })).toBeInTheDocument();
  expect(await screen.findByText("진행 중인 토론이 없어요.")).toBeInTheDocument();
});
it("shows persisted topics and actual votes with a full-card link", async () => {
  mount();
  const list = await screen.findByRole("list", { name: "토론 주제" });
  expect(await within(list).findByText("투표 31")).toBeInTheDocument();
  expect(within(list).getByText("한마디 4")).toBeInTheDocument();
  expect(within(list).getByText("71%")).toBeInTheDocument();
  const closedCard = within(list).getByRole("link", { name: "마감된 점심 토론" });
  expect(closedCard).toHaveAccessibleDescription(/맛있으면 기다려 71%.*시간이 더 소중해 29%/);
  expect(screen.getByRole("heading", { name: "토론해요", level: 1 })).toBeInTheDocument();
  expect(within(list).getByRole("link", { name: "마감된 점심 토론" })).toHaveAttribute(
    "href",
    "/sparring/4"
  );
  expect(within(list).getByRole("link", { name: "마감된 점심 토론" })).toHaveAttribute(
    "data-ph-capture-attribute-action", "sparring_join"
  );
  expect(within(list).queryByText("참여하기")).not.toBeInTheDocument();
  expect(within(list).getAllByRole("link")).toHaveLength(1);
});
it("shows an empty result instead of a percentage when a closed topic has no votes", async () => {
  listSparrings.mockImplementation(async ({ filter }) => page(filter === "closed" ? [{ ...topic, id: 4, title: "마감된 점심 토론", votesA: 0, votesB: 0 }] : []));
  mount();
  const card = await screen.findByRole("link", { name: "마감된 점심 토론" });
  expect(within(card).getByText("투표 없이 마감됐어요")).toBeInTheDocument();
  expect(card).toHaveAccessibleDescription(/투표 없이 마감됐어요/);
  expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
});
it("shows who leads, a tie, or an empty vote on open cards", async () => {
  listSparrings.mockImplementation(async ({ filter }) => page(filter === "closed" ? [] : [
    topic,
    { ...topic, id: 5, title: "동률 토론", votesA: 1, votesB: 1 },
    { ...topic, id: 6, title: "투표 전 토론", votesA: 0, votesB: 0 },
    { ...topic, id: 7, title: "두 번째 편 우세", votesA: 1, votesB: 3 }
  ]));
  mount();
  const first = await screen.findByRole("link", { name: /점심 20분 기다릴까\?.*맛있으면 기다려 우세/ });
  expect(within(first).getByText("71%")).toBeInTheDocument();
  expect(first).toHaveAccessibleName(/맛있으면 기다려 우세/);
  const tie = screen.getByRole("link", { name: /동률 토론.*동률/ });
  expect(within(tie).getAllByText("50%")).toHaveLength(2);
  expect(within(screen.getByRole("link", { name: /투표 전 토론.*아직 투표가 없어요/ })).getByText("아직 투표가 없어요")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /두 번째 편 우세.*시간이 더 소중해 우세/ })).toBeInTheDocument();
});
it("updates the remaining time on an open discussion card", async () => {
  const closesAt = new Date(Date.now() + 65000).toISOString();
  listSparrings.mockImplementation(async ({ filter }) => page(filter === "closed" ? [] : [{ ...topic, closesAt }]));
  mount();
  const card = await within(await screen.findByRole("region", { name: "진행 중인 토론" })).findByRole("link", { name: /점심 20분 기다릴까/ });
  const badge = within(card).getByText(/\d+분 \d+초 남음/);
  const initial = badge.textContent;
  await waitFor(() => expect(badge).not.toHaveTextContent(initial), { timeout: 2500 });
});
it("loads the next page when the discussion carousel reaches its end", async () => {
  listSparrings.mockImplementation(async ({ filter, cursor }) => {
    if (filter === "closed") return page([]);
    if (cursor) return page([{ ...topic, id: 5, title: "다음 토론" }]);
    return { items: [topic], nextCursor: "next-page", hasNext: true };
  });
  const { container } = mount();
  await within(await screen.findByRole("region", { name: "진행 중인 토론" })).findByRole("link", { name: /점심 20분 기다릴까/ });
  const carousel = container.querySelector(".sparring-featured-grid");
  Object.defineProperties(carousel, {
    scrollWidth: { configurable: true, value: 1000 },
    clientWidth: { configurable: true, value: 500 },
    scrollLeft: { configurable: true, value: 450 }
  });
  fireEvent.scroll(carousel);
  expect(await screen.findByRole("link", { name: /다음 토론/ })).toBeInTheDocument();
  expect(listSparrings).toHaveBeenCalledWith(expect.objectContaining({ filter: "open", cursor: "next-page" }));
});
it("searches both open and closed topics through the API", async () => {
  mount();
  await screen.findByRole("list");
  expect(screen.queryByRole("group", { name: "토론 목록 필터" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "점심" } });
  await screen.findByRole("heading", { name: topic.title });
  expect(listSparrings).toHaveBeenCalledWith(expect.objectContaining({ filter: "open", keyword: "점심" }));
  expect(listSparrings).toHaveBeenCalledWith(expect.objectContaining({ filter: "closed", keyword: "점심" }));
});
function fillTopicStep(dialog, title = "새 이야기") {
  fireEvent.change(within(dialog).getByRole("textbox", { name: "토론 주제" }), { target: { value: title } });
  fireEvent.click(within(dialog).getByRole("button", { name: "다음" }));
}
function fillChoicesStep(dialog, a = "첫 입장", b = "둘째 입장") {
  fireEvent.change(within(dialog).getByRole("textbox", { name: "첫 번째 생각" }), { target: { value: a } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "두 번째 생각" }), { target: { value: b } });
  fireEvent.click(within(dialog).getByRole("button", { name: "다음" }));
}
function reachFinalStep(dialog, title = "새 이야기", a = "첫 입장", b = "둘째 입장") {
  fillTopicStep(dialog, title);
  fillChoicesStep(dialog, a, b);
}
it("creates a topic and enters the returned room", async () => {
  createSparring.mockResolvedValue({ id: 10 });
  mount();
  await screen.findByRole("list");
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await within(dialog).findByRole("button", { name: "토론 만들기" });
  await import("@testing-library/react").then(({ waitFor }) =>
    waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/sparring/10"))
  );
  expect(createSparring).toHaveBeenCalledWith(
    { title: "새 이야기", a: "첫 입장", b: "둘째 입장", description: "", closesAt: endOfDay(addDateDays(today(), 1)) },
    expect.anything()
  );
});
it("invites anonymous visitors to login before creating", async () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "anonymous", member: null, login });
  listSparrings.mockResolvedValue(page([]));
  mount();
  expect(await screen.findByText("진행 중인 토론이 없어요.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  expect(login).toHaveBeenCalledTimes(1);
});
it("retries a failed list request", async () => {
  listSparrings.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(page());
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "다시 불러오기" }));
  expect(await screen.findByRole("heading", { name: topic.title })).toBeInTheDocument();
});
it("defaults to tomorrow and applies each quick deadline", async () => {
  mount();
  await screen.findByRole("list");
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  const dateButton = within(dialog).getByRole("button", { name: "마감 날짜 선택" });
  expect(dateButton).toHaveTextContent(formatEndpointDate(addDateDays(today(), 1)));
  for (const [label, days] of [["3일 뒤", 3], ["1주일 뒤", 7], ["15일 뒤", 15], ["내일", 1]]) {
    const button = within(dialog).getByRole("button", { name: label });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(dateButton).toHaveTextContent(formatEndpointDate(addDateDays(today(), days)));
  }
});
it("allows a calendar date and submits the end of that day in Korea", async () => {
  createSparring.mockResolvedValue({ id: 10 });
  mount();
  await screen.findByRole("list");
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog, "마감 있는 토론", "찬성", "반대");
  const chosen = addDateDays(today(), 4);
  fireEvent.click(within(dialog).getByRole("button", { name: "마감 날짜 선택" }));
  const initialMonth = monthStart(addDateDays(today(), 1));
  if (monthStart(chosen) !== initialMonth) fireEvent.click(within(dialog).getByRole("button", { name: "다음 달" }));
  fireEvent.click(within(dialog).getByRole("button", { name: formatDateLabel(chosen) }));
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(createSparring).toHaveBeenCalledWith(expect.objectContaining({ closesAt: endOfDay(chosen) }), expect.anything()));
});
it("disables past dates in the calendar", async () => {
  mount();
  await screen.findByRole("list");
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "마감 날짜 선택" }));
  const yesterday = addDateDays(today(), -1);
  if (monthStart(yesterday) !== monthStart(addDateDays(today(), 1))) fireEvent.click(within(dialog).getByRole("button", { name: "이전 달" }));
  expect(within(dialog).getByRole("button", { name: formatDateLabel(yesterday) })).toBeDisabled();
});

it("validates each step and preserves its draft when going back", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByRole("button", { name: "토론 만들기" })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "다음" }));
  expect(within(dialog).getByText("토론할 주제를 적어주세요.")).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox", { name: "토론 주제" })).toHaveFocus();
  fillTopicStep(dialog);
  fillChoicesStep(dialog, "같은 생각", "같은 생각");
  expect(within(dialog).getByText("서로 다른 두 생각을 적어주세요.")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "이전" }));
  expect(within(dialog).getByRole("textbox", { name: "토론 주제" })).toHaveValue("새 이야기");
  fireEvent.click(within(dialog).getByRole("button", { name: "다음" }));
  expect(within(dialog).getByRole("textbox", { name: "첫 번째 생각" })).toHaveValue("같은 생각");
  expect(createSparring).not.toHaveBeenCalled();
});

it("preserves final preview edits when going back and submits the revised topic", async () => {
  createSparring.mockResolvedValue({ id: 16 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "토론 주제" }), { target: { value: "쉬는 날, 집콕 vs 나들이?" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "첫 번째 생각" }), { target: { value: "집에서 푹 쉬기" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "두 번째 생각" }), { target: { value: "밖으로 기분 전환" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "이전" }));
  expect(within(dialog).getByRole("textbox", { name: "첫 번째 생각" })).toHaveValue("집에서 푹 쉬기");
  expect(within(dialog).getByRole("textbox", { name: "두 번째 생각" })).toHaveValue("밖으로 기분 전환");
  fireEvent.click(within(dialog).getByRole("button", { name: "다음" }));
  expect(within(dialog).getByRole("textbox", { name: "토론 주제" })).toHaveValue("쉬는 날, 집콕 vs 나들이?");
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await waitFor(() => expect(createSparring).toHaveBeenCalledWith(expect.objectContaining({
    title: "쉬는 날, 집콕 vs 나들이?", a: "집에서 푹 쉬기", b: "밖으로 기분 전환"
  }), expect.anything()));
});

it.each([
  ["토론 주제", " ", "토론할 주제를 적어주세요."],
  ["첫 번째 생각", " ", "첫 번째 생각을 적어주세요."],
  ["두 번째 생각", " ", "두 번째 생각을 적어주세요."],
  ["두 번째 생각", "첫 입장", "서로 다른 두 생각을 적어주세요."]
])("validates the edited %s on the final preview", async (label, value, message) => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  const input = within(dialog).getByRole("textbox", { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  expect(within(dialog).getByText(message)).toBeInTheDocument();
  expect(input).toHaveFocus();
  expect(createSparring).not.toHaveBeenCalled();
});

it("can skip the sample photo while preserving the discussion draft", async () => {
  createSparring.mockResolvedValue({ id: 12 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "대표사진 제거" }));
  expect(within(dialog).getByRole("button", { name: "사진 선택" })).toHaveTextContent("사진 추가하기");
  expect(within(dialog).getByRole("textbox", { name: "토론 주제" })).toHaveValue("새 이야기");
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await waitFor(() => expect(createSparring).toHaveBeenCalled());
  expect(createSparring.mock.calls[0][0]).not.toHaveProperty("representativeImageKey");
});

it("uploads a representative image and submits its storage key", async () => {
  uploadImage.mockResolvedValue({ imageKey: "groups/tmp/cover.webp" });
  createSparring.mockResolvedValue({ id: 12 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  const file = new File(["photo"], "cover.webp", { type: "image/webp" });
  fireEvent.change(within(dialog).getByLabelText("대표사진 파일"), { target: { files: [file] } });
  expect(within(dialog).getByAltText("선택한 대표사진 미리보기")).toHaveAttribute("src", "blob:photo-preview");
  expect(within(dialog).getByRole("button", { name: "토론 만들기" })).toBeDisabled();
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "토론 만들기" })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await waitFor(() => expect(createSparring).toHaveBeenCalledWith(expect.objectContaining({ representativeImageKey: "groups/tmp/cover.webp" }), expect.anything()));
  expect(uploadImage).toHaveBeenCalledWith(file);
});

it("keeps failed photos for retry and allows creating after removing them", async () => {
  uploadImage.mockRejectedValueOnce(new Error("offline"));
  createSparring.mockResolvedValue({ id: 13 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.change(within(dialog).getByLabelText("대표사진 파일"), {
    target: { files: [new File(["photo"], "cover.png", { type: "image/png" })] }
  });
  expect(await within(dialog).findByRole("button", { name: "다시 올리기" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "토론 만들기" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "대표사진 제거" }));
  expect(within(dialog).queryByAltText("선택한 대표사진 미리보기")).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-preview");
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await waitFor(() => expect(createSparring).toHaveBeenCalled());
  expect(createSparring.mock.calls[0][0]).not.toHaveProperty("representativeImageKey");
});

it("ignores a completed upload after that photo was removed", async () => {
  let resolveUpload;
  uploadImage.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
  createSparring.mockResolvedValue({ id: 14 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.change(within(dialog).getByLabelText("대표사진 파일"), {
    target: { files: [new File(["photo"], "cover.jpg", { type: "image/jpeg" })] }
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "대표사진 제거" }));
  const { act } = await import("@testing-library/react");
  await act(async () => resolveUpload({ imageKey: "groups/tmp/removed.jpg" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await waitFor(() => expect(createSparring).toHaveBeenCalled());
  expect(createSparring.mock.calls[0][0]).not.toHaveProperty("representativeImageKey");
});

it("rejects unsupported files before uploading", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog);
  fireEvent.change(within(dialog).getByLabelText("대표사진 파일"), {
    target: { files: [new File(["vector"], "cover.svg", { type: "image/svg+xml" })] }
  });
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("JPG, PNG, WEBP");
  expect(uploadImage).not.toHaveBeenCalled();
});

it("uses uploaded representative photos for both open and closed cards", async () => {
  listSparrings.mockImplementation(async ({ filter }) => page([{ ...topic, representativeImageUrl: "/api/images/sparrings/3/cover.webp", ...(filter === "closed" ? { id: 4, title: "마감된 사진 토론" } : {}) }]));
  const { container } = mount();
  await screen.findByRole("heading", { name: "마감된 사진 토론" });
  expect(container.querySelector(".sparring-featured-card > img")).toHaveAttribute("src", "/api/images/sparrings/3/cover.webp");
  expect(container.querySelector(".sparring-topic-row__image")).toHaveAttribute("src", "/api/images/sparrings/3/cover.webp");
});

it("retries a failed photo without losing the current step or text", async () => {
  uploadImage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ imageKey: "groups/tmp/retried.png" });
  createSparring.mockResolvedValue({ id: 15 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog, "사진 있는 이야기");
  const file = new File(["photo"], "retry.png", { type: "image/png" });
  fireEvent.change(within(dialog).getByLabelText("대표사진 파일"), { target: { files: [file] } });
  fireEvent.click(await within(dialog).findByRole("button", { name: "다시 올리기" }));
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "토론 만들기" })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  await waitFor(() => expect(createSparring).toHaveBeenCalledWith(expect.objectContaining({ title: "사진 있는 이야기", representativeImageKey: "groups/tmp/retried.png" }), expect.anything()));
  expect(uploadImage).toHaveBeenCalledTimes(2);
});

it("keeps the final step and draft after creation fails", async () => {
  createSparring.mockRejectedValueOnce(new Error("다시 시도해 주세요."));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "토론 만들기" }));
  const dialog = screen.getByRole("dialog");
  reachFinalStep(dialog, "보존할 이야기");
  fireEvent.click(within(dialog).getByRole("button", { name: "토론 만들기" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("다시 시도해 주세요.");
  expect(within(dialog).getByRole("button", { name: "마감 날짜 선택" })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "이전" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "이전" }));
  expect(within(dialog).getByRole("textbox", { name: "토론 주제" })).toHaveValue("보존할 이야기");
});
