import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GomokuLobbyPage } from "./index";
import { gomokuApi } from "../../features/gomoku/api";
import { useQuery } from "@tanstack/react-query";

const mockNavigate = jest.fn();

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), jest.fn()]
}));
jest.mock("../../features/auth", () => ({
  useAuth: () => ({ status: "authenticated", member: { id: 1 } })
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    cancelQueries: jest.fn().mockResolvedValue(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn().mockResolvedValue()
  })),
  useQuery: jest.fn(() => ({
    data: { items: [], hasNext: false },
    isPending: false,
    isError: false
  }))
}));

function latestRoomsQuery() {
  return useQuery.mock.calls.filter(([options]) => options.queryKey[1] === "rooms").at(-1)[0];
}

function openCreation() {
  render(<GomokuLobbyPage />);
  const button = screen.getByRole("button", { name: "방 만들기", exact: true });
  expect(button.closest(".games-empty")).not.toBeNull();
  expect(screen.queryByText("새 방을 만들고 첫 상대를 기다려 보세요.")).not.toBeInTheDocument();
  expect(button).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_room_create_open");
  fireEvent.click(button);
  return screen.getByRole("dialog", { name: "방 만들기" });
}

test.each([null, 8, 99])("lobby shows waiting and playing rooms with membership %s", async (roomId) => {
  const originalQuery = useQuery.getMockImplementation();
  const refetch = jest.fn().mockResolvedValue({ data: { roomId } });
  const join = jest.spyOn(gomokuApi, "join");
  mockNavigate.mockClear();
  useQuery.mockImplementation(({ queryKey }) => ({
    data: queryKey[1] === "mine" ? { roomId } : {
      items: [
        { id: 7, hostName: "가을", rule: "RENJU", status: "WAITING", guestMemberId: null },
        { id: 8, hostName: "겨울", rule: "RENJU", status: "PLAYING", guestMemberId: 3 }
      ],
      hasNext: false
    },
    refetch,
    isPending: false,
    isError: false
  }));
  try {
    render(<GomokuLobbyPage />);
    const waiting = screen.getByRole("heading", { name: "가을님과의 자리" }).closest("li");
    const playing = screen.getByRole("heading", { name: "겨울님과의 자리" }).closest("li");
    expect(waiting).toHaveTextContent("상대 대기 중");
    expect(waiting).toHaveTextContent("1 / 2");
    expect(within(waiting).getByRole("button", { name: "참여하기" })).toBeEnabled();
    expect(playing).toHaveTextContent("게임 중");
    expect(playing).toHaveTextContent("2 / 2");
    const button = within(playing).getByRole("button", { name: roomId === 8 ? "돌아가기" : "관전하기" });
    if (roomId === 8) {
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_my_room_open");
      fireEvent.click(button);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/games/gomoku/rooms/8"));
    } else {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("data-other-room");
      expect(button).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_observation_open");
      fireEvent.click(button);
      expect(mockNavigate).toHaveBeenCalledWith("/games/gomoku/rooms/8/watch");
    }
    expect(join).not.toHaveBeenCalled();
  } finally {
    join.mockRestore();
    useQuery.mockImplementation(originalQuery);
  }
});

test("each choice group always has exactly one checked option and selections remain independent", () => {
  const dialog = openCreation();
  const visibility = within(dialog).getByRole("group", { name: "공개 범위" });
  const rules = within(dialog).getByRole("group", { name: "대국 규칙" });
  const publicOption = within(visibility).getByRole("radio", { name: /^공개/ });
  const privateOption = within(visibility).getByRole("radio", { name: /^비공개/ });
  const standard = within(rules).getByRole("radio", { name: "기본 규칙", exact: true });
  const freestyle = within(rules).getByRole("radio", { name: "제한 없음", exact: true });
  expect(publicOption).toBeChecked();
  expect(standard).toBeChecked();
  fireEvent.click(privateOption);
  fireEvent.click(freestyle);
  expect(privateOption).toBeChecked();
  expect(publicOption).not.toBeChecked();
  expect(freestyle).toBeChecked();
  expect(standard).not.toBeChecked();
  fireEvent.click(privateOption);
  expect(privateOption).toBeChecked();
  expect(within(visibility).getAllByRole("radio", { checked: true })).toHaveLength(1);
  expect(within(rules).getAllByRole("radio", { checked: true })).toHaveLength(1);
  expect(privateOption).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "gomoku_visibility_select"
  );
  expect(freestyle).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_rule_select");
});

test("creation submits selected visibility and rule and freezes choices while pending", async () => {
  let complete;
  const create = jest.spyOn(gomokuApi, "create").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  try {
    const dialog = openCreation();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^비공개/ }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "제한 없음", exact: true }));
    fireEvent.click(within(dialog).getByRole("button", { name: "방 만들기", exact: true }));
    expect(create).toHaveBeenCalledWith({ visibility: "PRIVATE", rule: "FREESTYLE" });
    for (const choice of within(dialog).getAllByRole("radio")) expect(choice).toBeDisabled();
    complete({ roomId: 10 });
    await waitFor(() => expect(within(dialog).getAllByRole("radio")[0]).toBeEnabled());
  } finally {
    create.mockRestore();
  }
});

test("one info beside the rule heading shows both rules without changing the selection", () => {
  const dialog = openCreation();
  const info = within(dialog).getByRole("button", { name: "대국 규칙 안내" });
  expect(info.closest("legend")).toHaveTextContent("대국 규칙");
  expect(within(dialog).getAllByRole("button", { name: /규칙 안내|제한 없음 안내/ })).toHaveLength(1);
  const standard = within(dialog).getByRole("radio", { name: "기본 규칙", exact: true });
  fireEvent.pointerEnter(info);
  const tooltip = screen.getByRole("tooltip");
  expect(within(tooltip).getByRole("region", { name: "기본 규칙" })).toHaveTextContent("흑돌은 정확히 5개");
  expect(within(tooltip).getByRole("region", { name: "제한 없음" })).toHaveTextContent("흑돌과 백돌 모두 5개 이상");
  expect(tooltip).toHaveTextContent("흑돌은 3-3, 4-4와 6개 이상 잇기가 제한돼요.");
  expect(tooltip).toHaveTextContent("3-3, 4-4, 6개 이상 잇기 제한이 없어요.");
  expect(info).toHaveAttribute("aria-describedby", tooltip.id);
  expect(info).toHaveAttribute("data-ph-capture-attribute-action");
  expect(standard).toBeChecked();
  fireEvent.keyDown(info, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(dialog).toBeVisible();
});

test("rule info supports keyboard and touch without selecting or submitting the rule", () => {
  mockNavigate.mockClear();
  const dialog = openCreation();
  const info = within(dialog).getByRole("button", { name: "대국 규칙 안내" });
  fireEvent.focus(info);
  expect(screen.getByRole("tooltip")).toHaveTextContent("제한 없음");
  fireEvent.keyDown(info, { key: "Escape" });
  fireEvent.click(info);
  expect(screen.getByRole("tooltip")).toHaveTextContent("제한 없음");
  expect(within(dialog).getByRole("radio", { name: "기본 규칙", exact: true })).toBeChecked();
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(dialog).toBeVisible();
});

test("lobby uses seat wording and a separate return action without the deleted descriptions", () => {
  const originalQuery = useQuery.getMockImplementation();
  useQuery.mockImplementation(({ queryKey }) => ({
    data:
      queryKey[1] === "mine"
        ? { roomId: 7 }
        : { items: [{ id: 8, hostName: "크루", rule: "RENJU" }], hasNext: false },
    isPending: false,
    isError: false
  }));
  try {
    render(<GomokuLobbyPage />);
    expect(screen.getByRole("heading", { name: "크루님과의 자리" })).toBeVisible();
    expect(
      screen
        .getByRole("button", { name: "방 만들기", exact: true })
        .closest(".games-lobby-controls")
    ).not.toBeNull();
    expect(
      screen.queryByText("친구를 초대하거나 대기 중인 방에 참여하세요.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("공개된 방만 표시돼요.")).not.toBeInTheDocument();
    const current = screen.getByRole("complementary", { name: "참여 중인 자리" });
    expect(screen.getByRole("search", { name: "대기실 검색" }).closest(".games-lobby-controls").nextElementSibling).toBe(current);
    const back = within(current).getByRole("link", { name: "돌아가기", exact: true });
    expect(back).toHaveAttribute("href", "/games/gomoku/rooms/7");
    expect(back).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_my_room_open");
  } finally {
    useQuery.mockImplementation(originalQuery);
  }
});

test("room rows show the GitHub profile and fall back to the host initial when it cannot load", () => {
  const originalQuery = useQuery.getMockImplementation();
  useQuery.mockImplementation(({ queryKey }) => ({
    data: queryKey[1] === "mine" ? { roomId: null } : {
      items: [{ id: 8, hostName: "크루", rule: "RENJU", hostAvatarUrl: "https://avatars.githubusercontent.com/u/1" }],
      hasNext: false
    },
    isPending: false,
    isError: false
  }));
  try {
    render(<GomokuLobbyPage />);
    const avatar = screen.getByRole("img", { name: "크루 프로필" });
    expect(avatar).toHaveAttribute("src", "https://avatars.githubusercontent.com/u/1");
    fireEvent.error(avatar);
    expect(screen.queryByRole("img", { name: "크루 프로필" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("크루 프로필")).toHaveTextContent("크");
    expect(screen.getByRole("button", { name: "참여하기" })).toBeEnabled();
  } finally {
    useQuery.mockImplementation(originalQuery);
  }
});

test("name search updates immediately from the first page and clearing or reset restores all rooms", async () => {
  const originalQuery = useQuery.getMockImplementation();
  const list = jest.spyOn(gomokuApi, "list").mockResolvedValue({ items: [] });
  useQuery.mockImplementation(({ queryKey }) => ({
    data:
      queryKey[1] === "mine"
        ? { roomId: null }
        : {
            items: queryKey[2] ? [] : [{ id: 8, hostName: "크루", rule: "RENJU" }],
            hasNext: !queryKey[2],
            nextCursor: "next-page"
          },
    isPending: false,
    isError: false
  }));
  try {
    render(<GomokuLobbyPage />);
    fireEvent.click(screen.getByRole("button", { name: "다음 방 보기" }));
    const input = screen.getByRole("searchbox", { name: "이름 검색" });
    expect(input).toHaveAttribute("placeholder", "이름으로 검색하기");
    expect(input).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_rooms_search_input");
    expect(latestRoomsQuery().queryKey).toEqual(["gomoku", "rooms", "", "next-page"]);
    fireEvent.change(input, { target: { value: "  여울  " } });
    const query = latestRoomsQuery();
    expect(query.queryKey).toEqual(["gomoku", "rooms", "여울", null]);
    const signal = new AbortController().signal;
    await query.queryFn({ signal });
    expect(list).toHaveBeenCalledWith(null, "여울", signal);
    expect(screen.getByRole("heading", { name: "검색 결과가 없어요" })).toBeVisible();
    fireEvent.change(input, { target: { value: "" } });
    expect(latestRoomsQuery().queryKey).toEqual(["gomoku", "rooms", "", null]);
    expect(screen.getByRole("heading", { name: "크루님과의 자리" })).toBeVisible();
    fireEvent.change(input, { target: { value: "여울" } });
    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("heading", { name: "크루님과의 자리" })).toBeVisible();
  } finally {
    list.mockRestore();
    useQuery.mockImplementation(originalQuery);
  }
});

test("name search waits for Korean composition to finish before updating the keyword", () => {
  render(<GomokuLobbyPage />);
  const input = screen.getByRole("searchbox", { name: "이름 검색" });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "ㅇ" } });
  expect(input).toHaveValue("ㅇ");
  expect(latestRoomsQuery().queryKey).toEqual(["gomoku", "rooms", "", null]);
  fireEvent.change(input, { target: { value: "여울" } });
  expect(latestRoomsQuery().queryKey).toEqual(["gomoku", "rooms", "", null]);
  fireEvent.compositionEnd(input, { data: "여울" });
  expect(latestRoomsQuery().queryKey).toEqual(["gomoku", "rooms", "여울", null]);
});

test.each(["clear", "form", "button"])(
  "%s restarts a paginated name search from the first page",
  (action) => {
    const originalQuery = useQuery.getMockImplementation();
    useQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[1] === "mine"
          ? { roomId: null }
          : {
              items: [{ id: 8, hostName: "여울", rule: "RENJU" }],
              hasNext: true,
              nextCursor: "next-page"
            },
      isPending: false,
      isError: false
    }));
    try {
      render(<GomokuLobbyPage />);
      const input = screen.getByRole("searchbox", { name: "이름 검색" });
      fireEvent.change(input, { target: { value: "여울" } });
      fireEvent.click(screen.getByRole("button", { name: "다음 방 보기" }));
      expect(latestRoomsQuery().queryKey).toEqual(["gomoku", "rooms", "여울", "next-page"]);
      if (action === "clear") {
        fireEvent.change(input, { target: { value: "" } });
      } else if (action === "form") {
        fireEvent.submit(screen.getByRole("search", { name: "대기실 검색" }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: "검색", exact: true }));
      }
      expect(latestRoomsQuery().queryKey).toEqual([
        "gomoku",
        "rooms",
        action === "clear" ? "" : "여울",
        null
      ]);
    } finally {
      useQuery.mockImplementation(originalQuery);
    }
  }
);

test.each(["existing membership", "concurrent membership"])("join notice waits for fade-out completion and restarts on retry with %s", async (scenario) => {
  const originalQuery = useQuery.getMockImplementation();
  const refetch = jest.fn().mockResolvedValue({ data: { roomId: 7 } });
  if (scenario === "concurrent membership") {
    refetch.mockResolvedValueOnce({ data: { roomId: null } });
  }
  const join = jest.spyOn(gomokuApi, "join").mockRejectedValue({ status: 409 });
  useQuery.mockImplementation(({ queryKey }) => ({
    data:
      queryKey[1] === "mine"
        ? { roomId: null }
        : { items: [{ id: 8, hostName: "크루", rule: "RENJU" }], hasNext: false },
    refetch,
    isPending: false,
    isError: false
  }));
  try {
    render(<GomokuLobbyPage />);
    const button = screen.getByRole("button", { name: "참여하기", exact: true });
    await act(async () => fireEvent.click(button));
    expect(screen.getByRole("alert")).toHaveTextContent("이미 참여 중인 방이 있어요.");
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    if (scenario === "existing membership") expect(join).not.toHaveBeenCalled();
    else expect(join).toHaveBeenCalledWith(8);
    const firstNotice = screen.getByRole("alert");
    expect(firstNotice).toHaveClass("games-notice--transient");
    fireEvent.animationEnd(firstNotice.querySelector(".games-error"));
    expect(firstNotice).toBeVisible();
    await act(async () => fireEvent.click(button));
    const nextNotice = screen.getByRole("alert");
    expect(nextNotice).not.toBe(firstNotice);
    fireEvent.animationEnd(firstNotice);
    expect(nextNotice).toBeVisible();
    fireEvent.animationEnd(nextNotice);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally {
    join.mockRestore();
    useQuery.mockImplementation(originalQuery);
  }
});


test.each(["already joined", "joined concurrently"])("own room opens directly when %s", async (scenario) => {
  const originalQuery = useQuery.getMockImplementation();
  mockNavigate.mockClear();
  const refetch = jest.fn()
    .mockResolvedValueOnce({ data: { roomId: scenario === "already joined" ? 8 : null } })
    .mockResolvedValue({ data: { roomId: 8 } });
  const join = jest.spyOn(gomokuApi, "join").mockRejectedValue({ status: 409 });
  useQuery.mockImplementation(({ queryKey }) => ({
    data: queryKey[1] === "mine"
      ? { roomId: null }
      : { items: [{ id: 8, hostName: "크루", rule: "RENJU" }], hasNext: false },
    refetch,
    isPending: false,
    isError: false
  }));
  try {
    render(<GomokuLobbyPage />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기", exact: true }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/games/gomoku/rooms/8"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    if (scenario === "already joined") expect(join).not.toHaveBeenCalled();
    else expect(join).toHaveBeenCalledWith(8);
  } finally {
    join.mockRestore();
    useQuery.mockImplementation(originalQuery);
  }
});
