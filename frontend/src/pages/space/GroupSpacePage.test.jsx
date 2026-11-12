import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../../features/auth/index.js";
import { useGroup } from "../../features/group/index.js";
import { fetchGroupSpace, saveGroupSpace } from "../../features/group-space/api.js";
import { groupSpaceKeys } from "../../features/group-space/hooks.js";
import { routeRegistry } from "../../app/routes.js";
import { GroupSpacePage } from "./GroupSpacePage.jsx";
import { createInitialRoom, readSavedRoom } from "./roomState.js";

let mockRouteParams = {};
jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => mockRouteParams
}), { virtual: true });
jest.mock("../../features/auth/index.js", () => ({ useAuth: jest.fn() }));
jest.mock("../../features/group/index.js", () => ({ useGroup: jest.fn() }));
jest.mock("../../features/group-space/api.js", () => ({ fetchGroupSpace: jest.fn(), saveGroupSpace: jest.fn() }));
jest.mock("./roomState.js", () => {
  const actual = jest.requireActual("./roomState.js");
  return { ...actual, readSavedRoom: jest.fn(actual.readSavedRoom) };
});
jest.mock("./SpaceStudioPage.jsx", () => ({
  SpaceStudioPage: (props) => <MockEditor {...props} />
}));

function MockEditor({ initialRoom, onSave, canEdit, savedAt, groupContext }) {
  const [draft, setDraft] = useState(initialRoom);
  const [error, setError] = useState("");
  return <section aria-label="공간 편집기">
    <input aria-label="테스트 공간 이름" value={draft.name} readOnly={!canEdit}
      onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
    <span>{canEdit ? "편집 가능" : "읽기 전용"}</span>
    <output aria-label="저장 시각">{savedAt}</output>
    <a href={groupContext.backHref}>실제 모임 {groupContext.name}</a>
    {canEdit && <button onClick={async () => {
      try { setDraft(await onSave(draft)); setError(""); } catch (failure) { setError(failure.message); }
    }}>테스트 저장</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

const snapshot = (room = null, extra = {}) => ({ room, revision: room ? 3 : 0,
  canEdit: true, updatedAt: room ? "2026-11-09T14:00:00" : null, ...extra });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function setup({ path = "/groups/41/space", client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) } = {}) {
  mockRouteParams = { groupId: path.split("/")[2] };
  const tree = () => <QueryClientProvider client={client}><GroupSpacePage /></QueryClientProvider>;
  const rendered = render(tree());
  return { ...rendered, client, refresh: () => rendered.rerender(tree()) };
}
const editorName = () => screen.getByRole("textbox", { name: "테스트 공간 이름" });
const save = () => fireEvent.click(screen.getByRole("button", { name: "테스트 저장" }));

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ member: { id: 7 } });
  useGroup.mockImplementation((id) => ({ data: { id: Number(id), name: `모임 ${id}`, memberCount: 6 }, refetch: jest.fn() }));
  fetchGroupSpace.mockResolvedValue(snapshot());
});

test("group routes share the web shell so the expanded space can return without remounting", () => {
  expect(routeRegistry.find((route) => route.path === "/groups/:groupId/space"))
    .toMatchObject({ access: "public", page: "GroupDetailPage" });
  for (const path of ["/groups/:groupId", "/groups/:groupId/space"]) {
    expect(routeRegistry.find((route) => route.path === path)).not.toHaveProperty("layout", "immersive");
  }
});

test("only a successful empty-room response initializes a named room, ignoring local demo storage", async () => {
  const pending = deferred();
  fetchGroupSpace.mockReturnValue(pending.promise);
  localStorage.setItem("jarihana.space-studio.v1", JSON.stringify({ name: "다른 개인 공간" }));
  setup();
  expect(screen.getByRole("status", { name: "우리 모임 공간 불러오는 중" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
  await act(async () => pending.resolve(snapshot()));
  expect(await screen.findByDisplayValue("모임 41")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "실제 모임 모임 41" })).toHaveAttribute("href", "/groups/41");
  expect(localStorage.getItem("jarihana.space-studio.v1")).toContain("다른 개인 공간");
  localStorage.clear();
});

test("member sees the server room read-only", async () => {
  fetchGroupSpace.mockResolvedValue(snapshot({ ...createInitialRoom(), name: "서버 아지트" }, { canEdit: false }));
  setup();
  expect(await screen.findByDisplayValue("서버 아지트")).toHaveAttribute("readonly");
  expect(screen.getByText("읽기 전용")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "테스트 저장" })).not.toBeInTheDocument();
});

test.each([[403, "모임원만 들어갈 수 있어요"], [404, "모임을 찾을 수 없어요"], [500, "공간을 불러오지 못했어요"]])(
  "failed GET %s never opens a default editor", async (status, title) => {
    fetchGroupSpace.mockRejectedValue({ status });
    setup();
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
    expect(saveGroupSpace).not.toHaveBeenCalled();
  }
);

test("presentation rerenders reuse the validated room and a changed snapshot is validated again", async () => {
  fetchGroupSpace.mockResolvedValue(snapshot(createInitialRoom()));
  const { refresh, client } = setup();
  await screen.findByRole("region", { name: "공간 편집기" });
  const reads = readSavedRoom.mock.calls.length;
  refresh();
  expect(readSavedRoom).toHaveBeenCalledTimes(reads);

  const invalidRoom = { version: 8 };
  act(() => client.setQueryData(groupSpaceKeys.detail(41, 7), snapshot(invalidRoom)));
  expect(await screen.findByRole("heading", { name: "공간을 불러오지 못했어요" })).toBeInTheDocument();
  expect(readSavedRoom).toHaveBeenLastCalledWith(invalidRoom);
});

test("invalid saved room is an error, not a new default room", async () => {
  fetchGroupSpace.mockResolvedValue(snapshot({ version: 8, name: "깨진 공간" }));
  setup();
  expect(await screen.findByRole("heading", { name: "공간을 불러오지 못했어요" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
});

test("retrying an unavailable server loads its saved room", async () => {
  fetchGroupSpace.mockRejectedValueOnce({ status: 500 }).mockResolvedValueOnce(snapshot({ ...createInitialRoom(), name: "복구한 공간" }));
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(await screen.findByDisplayValue("복구한 공간")).toBeInTheDocument();
});

test("conflict preserves the draft and revision; successful save advances subsequent revisions", async () => {
  fetchGroupSpace.mockResolvedValue(snapshot(createInitialRoom()));
  saveGroupSpace.mockRejectedValueOnce({ status: 409, code: "GROUP_SPACE_CONFLICT" })
    .mockImplementation((id, { room, expectedRevision }) => Promise.resolve(snapshot(room, { revision: expectedRevision + 1, updatedAt: "2026-11-09T15:00:00" })));
  setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  fireEvent.change(editorName(), { target: { value: "저장 전 초안" } });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("다른 곳에서 공간이 먼저 저장됐어요");
  expect(editorName()).toHaveValue("저장 전 초안");
  save();
  await waitFor(() => expect(screen.getByLabelText("저장 시각")).toHaveTextContent("2026-11-09T15:00:00"));
  save();
  await waitFor(() => expect(saveGroupSpace).toHaveBeenCalledTimes(3));
  expect(saveGroupSpace.mock.calls.map(([id, request]) => [id, request.expectedRevision])).toEqual([["41", 3], ["41", 3], ["41", 4]]);
});

test("malformed save response keeps the draft mounted and the last confirmed revision", async () => {
  fetchGroupSpace.mockResolvedValue(snapshot(createInitialRoom()));
  saveGroupSpace.mockResolvedValue(snapshot({ version: 8 }, { revision: 4 }));
  setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  fireEvent.change(editorName(), { target: { value: "잃지 않을 초안" } });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("서버의 저장 결과");
  expect(editorName()).toHaveValue("잃지 않을 초안");
  save();
  await waitFor(() => expect(saveGroupSpace).toHaveBeenCalledTimes(2));
  expect(saveGroupSpace.mock.calls[1][1].expectedRevision).toBe(3);
});

test("revoked write access keeps draft visible and switches to read-only", async () => {
  saveGroupSpace.mockRejectedValue({ status: 403 });
  setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  fireEvent.change(editorName(), { target: { value: "권한 변경 전 초안" } });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("권한이 변경됐어요");
  expect(editorName()).toHaveValue("권한 변경 전 초안");
  expect(editorName()).toHaveAttribute("readonly");
  expect(screen.queryByRole("button", { name: "테스트 저장" })).not.toBeInTheDocument();
});

test("switching groups never carries the previous draft or revision into the next space", async () => {
  fetchGroupSpace.mockImplementation((id) => Promise.resolve(snapshot({ ...createInitialRoom(), name: `서버 ${id}` }, { revision: Number(id) })));
  saveGroupSpace.mockImplementation((id, { room, expectedRevision }) => Promise.resolve(snapshot(room, { revision: expectedRevision + 1 })));
  const { refresh } = setup();
  await screen.findByDisplayValue("서버 41");
  fireEvent.change(editorName(), { target: { value: "41의 미저장 초안" } });
  mockRouteParams = { groupId: "42" };
  refresh();
  await screen.findByDisplayValue("서버 42");
  save();
  await waitFor(() => expect(saveGroupSpace).toHaveBeenCalledTimes(1));
  expect(saveGroupSpace).toHaveBeenCalledWith("42", expect.objectContaining({ expectedRevision: 42, room: expect.objectContaining({ name: "서버 42" }) }));
});

test("a cached leader capability is not shown before a fresh membership response", async () => {
  const client = new QueryClient();
  client.setQueryData(groupSpaceKeys.detail(41, 7), snapshot({ ...createInitialRoom(), name: "오래된 권한" }));
  const pending = deferred();
  fetchGroupSpace.mockReturnValue(pending.promise);
  setup({ client });
  expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
  await act(async () => pending.resolve(snapshot(createInitialRoom(), { canEdit: false })));
  expect(await screen.findByText("읽기 전용")).toBeInTheDocument();
});

test("invalid route ids do not make any space API request", () => {
  setup({ path: "/groups/invalid/space" });
  expect(screen.getByRole("heading", { name: "모임을 찾을 수 없어요" })).toBeInTheDocument();
  expect(fetchGroupSpace).not.toHaveBeenCalled();
});

test("changing login accounts clears the old draft and fetches permissions under a distinct key", async () => {
  const nextAccount = deferred();
  fetchGroupSpace.mockResolvedValueOnce(snapshot({ ...createInitialRoom(), name: "7번 회원의 공간" }))
    .mockImplementationOnce(() => nextAccount.promise);
  const { refresh, client } = setup();
  await screen.findByDisplayValue("7번 회원의 공간");
  fireEvent.change(editorName(), { target: { value: "7번 회원의 초안" } });
  useAuth.mockReturnValue({ member: { id: 19 } });
  refresh();
  expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
  await act(async () => nextAccount.resolve(snapshot({ ...createInitialRoom(), name: "공유된 서버 공간" }, { canEdit: false })));
  expect(await screen.findByDisplayValue("공유된 서버 공간")).toHaveAttribute("readonly");
  expect(client.getQueryData(groupSpaceKeys.detail(41, 19)).canEdit).toBe(false);
  expect(fetchGroupSpace).toHaveBeenCalledTimes(2);
});

test("a pending save cannot issue a second write at the same revision", async () => {
  const pending = deferred();
  saveGroupSpace.mockReturnValue(pending.promise);
  setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  save();
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하고 있어요");
  expect(saveGroupSpace).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(snapshot(createInitialRoom(), { revision: 1 })));
});

test("a network save failure retains changes and does not advance revision", async () => {
  saveGroupSpace.mockRejectedValue(new Error("네트워크 연결을 확인해 주세요."));
  setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  fireEvent.change(editorName(), { target: { value: "네트워크 오류 초안" } });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("네트워크 연결");
  expect(editorName()).toHaveValue("네트워크 오류 초안");
  save();
  await waitFor(() => expect(saveGroupSpace).toHaveBeenCalledTimes(2));
  expect(saveGroupSpace.mock.calls.map(([, request]) => request.expectedRevision)).toEqual([0, 0]);
});

test("a transient group refetch failure after editing keeps the same editor and draft", async () => {
  const groupData = { id: 41, name: "모임 41", memberCount: 6 };
  useGroup.mockReturnValue({ data: groupData, isError: false });
  const { refresh } = setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  const editor = screen.getByRole("region", { name: "공간 편집기" });
  fireEvent.change(editorName(), { target: { value: "재연결 전 편집한 초안" } });
  useGroup.mockReturnValue({ data: groupData, isError: true, error: { status: 503 }, isRefetchError: true });
  refresh();
  expect(screen.getByRole("region", { name: "공간 편집기" })).toBe(editor);
  expect(editorName()).toHaveValue("재연결 전 편집한 초안");
  expect(screen.queryByRole("heading", { name: "공간을 불러오지 못했어요" })).not.toBeInTheDocument();
});

test("a transient space refetch failure preserves the mounted editor and draft", async () => {
  const { client } = setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  const editor = screen.getByRole("region", { name: "공간 편집기" });
  fireEvent.change(editorName(), { target: { value: "공간 조회 오류 전 초안" } });
  fetchGroupSpace.mockRejectedValue({ status: 503 });
  await act(async () => { await client.refetchQueries({ queryKey: groupSpaceKeys.detail(41, 7) }); });
  expect(screen.getByRole("region", { name: "공간 편집기" })).toBe(editor);
  expect(editorName()).toHaveValue("공간 조회 오류 전 초안");
});

test("initial cached data plus a failed fresh lookup still shows an error instead of an editor", async () => {
  const client = new QueryClient();
  client.setQueryData(groupSpaceKeys.detail(41, 7), snapshot(createInitialRoom()));
  fetchGroupSpace.mockRejectedValue({ status: 503 });
  setup({ client });
  expect(await screen.findByRole("heading", { name: "공간을 불러오지 못했어요" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
});

test("an explicit access denial during refetch removes the no-longer-authorized space", async () => {
  const { client } = setup();
  await screen.findByRole("textbox", { name: "테스트 공간 이름" });
  fetchGroupSpace.mockRejectedValue({ status: 403 });
  await act(async () => { await client.refetchQueries({ queryKey: groupSpaceKeys.detail(41, 7) }); });
  expect(await screen.findByRole("heading", { name: "모임원만 들어갈 수 있어요" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "공간 편집기" })).not.toBeInTheDocument();
});
