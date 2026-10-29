import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SparringPage from "../../src/pages/sparring/SparringPage.jsx";
import { useAuth } from "../../src/features/auth";
import { createSparring, listSparrings } from "../../src/features/sparring/api";

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
const topic = {
  id: 3,
  title: "점심 20분 기다릴까?",
  a: "맛있으면 기다려",
  b: "시간이 더 소중해",
  votesA: 22,
  votesB: 9,
  postCount: 4
};
const page = (items = [topic]) => ({ items, nextCursor: null, hasNext: false });
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
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 1 }, login: jest.fn() });
  listSparrings.mockResolvedValue(page());
});
it("shows persisted topics and actual votes; replay never casts a vote", async () => {
  mount();
  const list = await screen.findByRole("list", { name: "스파링 주제" });
  expect(within(list).getByText("4 한마디 · 31명 참여")).toBeInTheDocument();
  expect(within(list).getByText("71%")).toBeInTheDocument();
  expect(within(list).getByRole("link", { name: /참여하기/ })).toHaveAttribute(
    "href",
    "/sparring/3"
  );
  fireEvent.click(within(list).getByRole("button", { name: /캡슐 움직임/ }));
  expect(within(list).getByRole("status")).toHaveTextContent("민트 편의 캡슐 발사 미리보기");
  expect(within(list).getByText("71%")).toBeInTheDocument();
});
it("searches and filters through the API", async () => {
  mount();
  await screen.findByRole("list");
  fireEvent.click(screen.getByRole("button", { name: "대화 있는 판" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "점심" } });
  await screen.findByRole("heading", { name: topic.title });
  expect(listSparrings).toHaveBeenLastCalledWith(
    expect.objectContaining({ filter: "active", keyword: "점심" })
  );
});
it("creates a topic and enters the returned room", async () => {
  createSparring.mockResolvedValue({ id: 10 });
  mount();
  await screen.findByRole("list");
  fireEvent.click(screen.getByRole("button", { name: "주제 올리기" }));
  const dialog = screen.getByRole("dialog");
  for (const [label, value] of [
    ["주제", "새 이야기"],
    ["민트 편의 생각", "첫 입장"],
    ["코랄 편의 생각", "둘째 입장"]
  ])
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  fireEvent.click(within(dialog).getByRole("button", { name: "스파링 열기" }));
  await screen.findByRole("button", { name: "스파링 열기" });
  await import("@testing-library/react").then(({ waitFor }) =>
    waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/sparring/10"))
  );
  expect(createSparring).toHaveBeenCalledWith(
    { title: "새 이야기", a: "첫 입장", b: "둘째 입장", description: "" },
    expect.anything()
  );
});
it("invites anonymous visitors to login before creating", async () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "anonymous", member: null, login });
  listSparrings.mockResolvedValue(page([]));
  mount();
  expect(await screen.findByText("아직 열린 스파링이 없어요")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "주제 올리기" }));
  expect(login).toHaveBeenCalledTimes(1);
});
it("retries a failed list request", async () => {
  listSparrings.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(page());
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "다시 불러오기" }));
  expect(await screen.findByRole("heading", { name: topic.title })).toBeInTheDocument();
});
