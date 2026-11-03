import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  useNavigate: () => mockNavigate
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
    const back = within(current).getByRole("link", { name: "돌아가기", exact: true });
    expect(back).toHaveAttribute("href", "/games/gomoku/rooms/7");
    expect(back).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_my_room_open");
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

test("joining checks the latest membership and explains an existing room without joining another", async () => {
  const originalQuery = useQuery.getMockImplementation();
  const refetch = jest.fn().mockResolvedValue({ data: { roomId: 7 } });
  const join = jest.spyOn(gomokuApi, "join").mockResolvedValue({ roomId: 8 });
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
    fireEvent.click(screen.getByRole("button", { name: "참여하기", exact: true }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("이미 참여 중인 방이 있어요.")
    );
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(join).not.toHaveBeenCalled();
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
