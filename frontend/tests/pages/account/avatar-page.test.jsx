import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AVATAR_BASIC_APPEARANCE } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { AvatarPage } from "../../../src/pages/account/AvatarPage.jsx";
import { saveMyAvatar, deleteMyAvatar } from "../../../src/features/avatar/api.js";
import { useMyAvatar } from "../../../src/features/avatar/hooks.js";

const mockNavigate = jest.fn();
const mockReload = jest.fn();

jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useBeforeUnload: jest.fn(),
  useLocation: () => ({ state: null }),
  useNavigate: () => mockNavigate,
  useBlocker: () => ({ state: "unblocked" })
}));
jest.mock("../../../src/features/auth/index.js", () => ({
  useAuth: () => ({ member: { id: 7 }, sessionVersion: 1, reload: mockReload })
}));
jest.mock("../../../src/features/avatar/hooks.js", () => ({ useMyAvatar: jest.fn() }));
jest.mock("../../../src/features/avatar/api.js", () => ({ saveMyAvatar: jest.fn(), deleteMyAvatar: jest.fn() }));
jest.mock("../../../src/features/avatar/AvatarFrame.jsx", () => {
  const { useEffect } = jest.requireActual("react");
  return { AvatarFrame: function MockFrame({ appearance, onChange, onReady }) {
    useEffect(() => { onReady(); }, [onReady]);
    return <><button onClick={() => onChange({ ...appearance, hair: "flowing" })}>긴머리 선택</button><button onClick={() => onChange({ ...appearance, hair: "bob" })}>단발 선택</button></>;
  } };
});

function setup(customized = false, appearance = AVATAR_BASIC_APPEARANCE) {
  useMyAvatar.mockReturnValue({ data: { customized, appearance: { ...appearance } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AvatarPage /></QueryClientProvider>);
  return { user: userEvent.setup(), client };
}

beforeEach(() => { jest.clearAllMocks(); });

it.each(["save", "delete"])("%s에서 계정 변경을 감지하면 이전 편집기를 닫고 인증을 다시 확인한다", async (operation) => {
  const { user, client } = setup(true);
  let finishReload;
  mockReload.mockImplementationOnce(() => new Promise(resolve => { finishReload = resolve; }));
  const accountChanged = Object.assign(new Error("계정 변경"), { code: "ACCOUNT_CHANGED" });
  if (operation === "save") {
    saveMyAvatar.mockRejectedValueOnce(accountChanged);
    await user.click(screen.getByRole("button", { name: "긴머리 선택" }));
    await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
    expect(saveMyAvatar).toHaveBeenCalledTimes(1);
    expect(saveMyAvatar).toHaveBeenCalledWith({ ...AVATAR_BASIC_APPEARANCE, hair: "flowing" }, 7);
  } else {
    deleteMyAvatar.mockRejectedValueOnce(accountChanged);
    await user.click(screen.getByRole("button", { name: "아바타 삭제", exact: true }));
    await user.click(screen.getByRole("button", { name: "삭제하고 기본형으로" }));
    expect(deleteMyAvatar).toHaveBeenCalledTimes(1);
    expect(deleteMyAvatar).toHaveBeenCalledWith(7);
  }
  expect(mockNavigate).toHaveBeenCalledWith("/my/avatar", {
    replace: true, state: { avatarAccountChanged: true }
  });
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "저장하기", exact: true })).not.toBeInTheDocument();
  expect(client.getQueryData(["member-avatar", 7, 1])).toBeUndefined();
  await act(async () => finishReload());
});

it.each(["save", "delete"])("%s 성공 후 늦게 도착한 이전 조회가 화면을 되돌리지 않는다", async (operation) => {
  const previous = { customized: true, appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "flowing" } };
  const { user, client } = setup(true, previous.appearance);
  let resolveRead;
  const read = client.fetchQuery({
    queryKey: ["member-avatar", 7, 1],
    queryFn: () => new Promise(resolve => { resolveRead = resolve; })
  }).catch(() => undefined);
  await waitFor(() => expect(resolveRead).toEqual(expect.any(Function)));
  if (operation === "save") {
    saveMyAvatar.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: "단발 선택" }));
    await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  } else {
    deleteMyAvatar.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: "아바타 삭제", exact: true }));
    await user.click(screen.getByRole("button", { name: "삭제하고 기본형으로" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }
  await act(async () => { resolveRead(previous); await read; });
  expect(client.getQueryData(["member-avatar", 7, 1])).toEqual(operation === "save"
    ? { customized: true, appearance: { ...previous.appearance, hair: "bob" } }
    : { customized: false, appearance: AVATAR_BASIC_APPEARANCE });
});

it("기본형을 처음 저장하는 경우에도 마이페이지로 이동한다", async () => {
  saveMyAvatar.mockResolvedValueOnce(undefined);
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my", { replace: true }));
});

it("저장 중 추가로 편집해도 요청 시점의 조합을 저장하고 새 변경은 미저장으로 남긴다", async () => {
  let resolve;
  saveMyAvatar.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { user, client } = setup();
  await user.click(screen.getByRole("button", { name: "긴머리 선택" }));
  await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
  await user.click(screen.getByRole("button", { name: "단발 선택" }));
  await act(async () => resolve());
  expect(client.getQueryData(["member-avatar", 7, 1]).appearance.hair).toBe("flowing");
  expect(screen.getByRole("status")).toHaveTextContent("아직 저장하지 않은");
  expect(mockNavigate).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "저장하기", exact: true })).toBeEnabled());
  saveMyAvatar.mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
  await waitFor(() => expect(client.getQueryData(["member-avatar", 7, 1]).appearance.hair).toBe("bob"));
  expect(mockNavigate).toHaveBeenCalledWith("/my", { replace: true });
});

it("저장 성공 후 마이페이지로 이동하고 실패하면 편집 내용을 유지한다", async () => {
  saveMyAvatar.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  const { user, client } = setup();
  await user.click(screen.getByRole("button", { name: "긴머리 선택" }));
  await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했어요");
  expect(mockNavigate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "저장하기", exact: true }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my", { replace: true }));
  expect(client.getQueryData(["member-avatar", 7, 1]).appearance.hair).toBe("flowing");
});

it("삭제 실패는 확인창 안에 표시하고 기존 아바타를 보존한 뒤 재시도로 기본형으로 돌아간다", async () => {
  deleteMyAvatar.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  const { user, client } = setup(true);
  await user.click(screen.getByRole("button", { name: "아바타 삭제", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "아바타를 삭제할까요?" });
  await user.click(within(dialog).getByRole("button", { name: "삭제하고 기본형으로" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("저장된 아바타를 유지했어요");
  expect(client.getQueryData(["member-avatar", 7, 1])).toBeUndefined();
  await user.click(within(dialog).getByRole("button", { name: "삭제하고 기본형으로" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(client.getQueryData(["member-avatar", 7, 1])).toEqual({ customized: false, appearance: AVATAR_BASIC_APPEARANCE });
  expect(screen.getByRole("button", { name: "아바타 삭제", exact: true })).toBeDisabled();
});
