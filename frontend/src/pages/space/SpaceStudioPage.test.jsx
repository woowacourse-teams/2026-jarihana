import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SpaceStudioPage } from "./SpaceStudioPage";
import { ATMOSPHERE_PRESETS, DEFAULT_ATMOSPHERE, STORAGE_KEY, TEMPLATE_ATMOSPHERES, THEMES, createInitialRoom } from "./roomState";
import { prepareRoomPhoto } from "./roomPhoto";

let sceneProps;
const mockOpenMusic = jest.fn();
jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  MemoryRouter: ({ children }) => children
}), { virtual: true });
jest.mock("../../features/group-music/index.js", () => ({ useGroupMusic: () => ({ openMusic: mockOpenMusic }) }));
jest.mock("./RoomCanvas", () => ({ RoomCanvas: (props) => { sceneProps = props; return <div data-testid="room-scene" />; } }));
jest.mock("./roomPhoto", () => ({ prepareRoomPhoto: jest.fn() }));

beforeEach(() => { localStorage.clear(); jest.restoreAllMocks(); prepareRoomPhoto.mockReset(); mockOpenMusic.mockReset(); });
function click(name) { fireEvent.click(screen.getByRole("button", { name, exact: true })); }
function openFurniture() {
  if (screen.getByRole("button", { name: "가구", exact: true }).getAttribute("aria-pressed") !== "true") click("가구");
}
function selectSofa() { act(() => sceneProps.onSelect("sofa")); }

test("the edge menus leave the scene open until a category or furniture is selected", () => {
  render(<SpaceStudioPage />);
  expect(screen.getByRole("navigation", { name: "공간 메뉴" })).toBeInTheDocument();
  expect(screen.queryByLabelText("꾸미기 항목")).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar", { name: "선택한 가구 조작" })).not.toBeInTheDocument();
  click("가구");
  expect(screen.getByLabelText("꾸미기 항목")).toBeInTheDocument();
  click("꾸미기 항목 닫기");
  expect(screen.queryByLabelText("꾸미기 항목")).not.toBeInTheDocument();
});

test("menu and camera controls collapse independently without replacing the scene", () => {
  render(<SpaceStudioPage />);
  const scene = screen.getByTestId("room-scene");
  click("메뉴 접기");
  expect(screen.getByRole("button", { name: "메뉴 펼치기" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation", { name: "공간 메뉴" })).not.toBeInTheDocument();
  expect(screen.getByRole("toolbar", { name: "시점 조절" })).toBeVisible();
  click("시점 도구 접기");
  expect(screen.getByRole("button", { name: "시점 도구 펼치기" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("toolbar", { name: "시점 조절" })).not.toBeInTheDocument();
  click("UI 접기");
  expect(screen.getByRole("button", { name: "UI 펼치기" })).toHaveFocus();
  expect(screen.queryByRole("button", { name: "메뉴 펼치기" })).not.toBeInTheDocument();
  click("UI 펼치기");
  expect(screen.getByRole("button", { name: "메뉴 펼치기" })).toBeVisible();
  expect(screen.getByRole("button", { name: "시점 도구 펼치기" })).toBeVisible();
  click("메뉴 펼치기"); click("시점 도구 펼치기");
  expect(screen.getByRole("navigation", { name: "공간 메뉴" })).toBeVisible();
  expect(screen.getByRole("toolbar", { name: "시점 조절" })).toBeVisible();
  expect(screen.getByTestId("room-scene")).toBe(scene);
});

test("hiding the UI preserves camera, selection and furniture edits for save and undo", async () => {
  render(<SpaceStudioPage />);
  selectSofa(); click("가구 오른쪽으로 이동"); click("확대");
  const edited = sceneProps.room;
  const selection = sceneProps.selectedId;
  const zoom = sceneProps.zoom;
  click("UI 접기");
  expect(sceneProps.editable).toBe(false);
  expect(sceneProps.selectedId).toBeNull();
  expect(sceneProps.room).toBe(edited);
  expect(sceneProps.zoom).toBe(zoom);
  act(() => sceneProps.onSelect(null));
  expect(screen.getByRole("button", { name: "UI 펼치기" })).toBeVisible();
  expect(screen.queryByRole("toolbar", { name: "선택한 가구 조작" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "저장", exact: true })).not.toBeInTheDocument();
  click("UI 펼치기");
  expect(sceneProps.editable).toBe(true);
  expect(sceneProps.selectedId).toBe(selection);
  expect(sceneProps.room).toBe(edited);
  expect(sceneProps.zoom).toBe(zoom);
  click("실행 취소");
  expect(sceneProps.room.items).not.toEqual(edited.items);
  click("다시 실행");
  expect(sceneProps.room.items).toEqual(edited.items);
  await act(async () => click("저장"));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).items).toEqual(edited.items);
});

test("a hidden form remains mounted with its draft and escape restores tools before exiting walking", () => {
  render(<SpaceStudioPage />);
  click("내 자리");
  const name = screen.getByRole("textbox", { name: "공간 이름" });
  fireEvent.change(name, { target: { value: "우리만의 공중섬" } });
  click("UI 접기");
  expect(name).not.toBeVisible();
  expect(screen.queryByRole("textbox", { name: "공간 이름" })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByTestId("room-scene"), { key: "Escape" });
  expect(screen.getByRole("textbox", { name: "공간 이름" })).toBe(name);
  expect(name).toHaveValue("우리만의 공중섬");
  expect(screen.getByRole("button", { name: "UI 접기" })).toHaveFocus();
  click("1인칭");
  const room = sceneProps.room;
  click("UI 접기");
  expect(screen.queryByRole("toolbar", { name: "걷기 조작" })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByTestId("room-scene"), { key: "Escape" });
  expect(sceneProps.view).toBe("firstPerson");
  expect(sceneProps.room).toBe(room);
  expect(screen.getByRole("toolbar", { name: "걷기 조작" })).toBeVisible();
});

test("opening a feature from the scene preserves the mounted clubhouse panel and its draft", () => {
  const openFeature = jest.fn();
  render(<SpaceStudioPage groupContext={groupContext} canEdit={false} clubhouse={{ mode: "use", onOpenFeature: openFeature,
    overlay: <aside aria-label="활동 패널"><input aria-label="작성 중인 활동" defaultValue="함께 찍은 사진" /></aside> }} />);
  const draft = screen.getByRole("textbox", { name: "작성 중인 활동" });
  fireEvent.change(draft, { target: { value: "이번 주 사진 모임" } });
  act(() => sceneProps.onSelect("music-console"));
  expect(mockOpenMusic).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("textbox", { name: "작성 중인 활동" })).toBe(draft);
  expect(draft).toHaveValue("이번 주 사진 모임");
  expect(sceneProps.editable).toBe(false);
});

test("camera starts wider, zooms beyond both old limits and resets repeatedly", () => {
  render(<SpaceStudioPage />);
  expect(sceneProps.zoom).toBe(0.7);
  const zoomOut = screen.getByRole("button", { name: "축소", exact: true });
  const zoomIn = screen.getByRole("button", { name: "확대", exact: true });
  for (let i = 0; i < 30; i += 1) fireEvent.click(zoomOut);
  expect(sceneProps.zoom).toBeLessThan(0.1);
  expect(zoomOut).toBeEnabled();
  for (let i = 0; i < 60; i += 1) fireEvent.click(zoomIn);
  expect(sceneProps.zoom).toBeGreaterThan(1.5);
  expect(zoomIn).toBeEnabled();
  act(() => sceneProps.onZoomChange(3));
  click("확대");
  expect(sceneProps.zoom).toBeCloseTo(3.3);
  click("시점 초기화");
  expect(sceneProps.zoom).toBe(0.7);
  const reset = sceneProps.cameraReset;
  click("시점 초기화");
  expect(sceneProps.cameraReset).toBe(reset + 1);
  click("공간 전체 보기");
  expect(sceneProps.zoom).toBe(0.7);
  expect(sceneProps.view).toBe("site");
  expect(sceneProps.cameraReset).toBe(reset + 2);
});

const groupContext = { id: 42, name: "주말 보드게임", backHref: "/groups/42", membersHref: "/groups/42/members", memberCount: 8 };

test("a group save waits for the server, prevents duplicate saves and never writes browser storage", async () => {
  let resolveSave;
  const onSave = jest.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
  render(<MemoryRouter><SpaceStudioPage initialRoom={createInitialRoom()} groupContext={groupContext} onSave={onSave} /></MemoryRouter>);
  selectSofa(); click("가구 오른쪽으로 이동");
  const edited = sceneProps.room;
  click("저장");
  expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  expect(sceneProps.editable).toBe(false);
  click("가구 오른쪽으로 이동");
  fireEvent.click(screen.getByRole("button", { name: "저장 중…" }));
  expect(sceneProps.room).toEqual(edited);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("우리 모임 공간을 저장했어요.")).not.toBeInTheDocument();
  click("UI 접기");
  await act(async () => resolveSave(edited));
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("우리 모임 공간을 저장했어요.");
  click("UI 펼치기");
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(screen.getByRole("link", { name: "모임원 8명" })).toHaveAttribute("href", "/groups/42/members");
});

test("server conflicts retain the editable draft without a browser-only success fallback", async () => {
  const onSave = jest.fn().mockRejectedValue(new Error("다른 창에서 공간이 바뀌었어요. 다시 입장해 주세요."));
  render(<MemoryRouter><SpaceStudioPage initialRoom={createInitialRoom()} groupContext={groupContext} onSave={onSave} /></MemoryRouter>);
  selectSofa(); click("가구 오른쪽으로 이동");
  const edited = sceneProps.room;
  await act(async () => click("저장"));
  expect(screen.getByRole("alert")).toHaveTextContent("다른 창에서 공간이 바뀌었어요");
  expect(sceneProps.room).toEqual(edited);
  expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();
  expect(sceneProps.editable).toBe(true);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

test("members can walk and read memories but cannot mutate or save the shared room", () => {
  const room = createInitialRoom();
  room.items.push({ id: "shared-memory", kind: "memory", x: 0, z: 0, rotation: 0, title: "함께한 첫 모임", note: "다음에도 만나요", photo: "", link: "https://example.com/record" });
  const onSave = jest.fn();
  render(<MemoryRouter><SpaceStudioPage initialRoom={room} groupContext={groupContext} canEdit={false} onSave={onSave} /></MemoryRouter>);
  expect(sceneProps.editable).toBe(false);
  expect(screen.queryByRole("button", { name: "저장", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "가구", exact: true })).not.toBeInTheDocument();
  const sofa = room.items.find((item) => item.id === "sofa");
  act(() => sceneProps.onMove(sofa.id, sofa.x + 0.25, sofa.z));
  expect(sceneProps.room).toEqual(room);
  act(() => sceneProps.onSelect("music-console"));
  expect(mockOpenMusic).toHaveBeenCalled();
  click("추억 소품");
  expect(screen.getByRole("heading", { name: "함께한 첫 모임" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "활동 기록 열기" })).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  click("1인칭");
  expect(sceneProps.view).toBe("firstPerson");
  expect(onSave).not.toHaveBeenCalled();
});

test("movement, undo, redo and cancel restore the expected layout", () => {
  render(<SpaceStudioPage />);
  selectSofa();
  const start = sceneProps.room.items.find((item) => item.id === "sofa").x;
  click("가구 오른쪽으로 이동");
  expect(sceneProps.room.items.find((item) => item.id === "sofa").x).toBeGreaterThan(start);
  click("실행 취소");
  expect(sceneProps.room.items.find((item) => item.id === "sofa").x).toBe(start);
  click("다시 실행");
  expect(sceneProps.room.items.find((item) => item.id === "sofa").x).toBeGreaterThan(start);
  click("취소");
  expect(sceneProps.room.items.find((item) => item.id === "sofa").x).toBe(start);
  expect(screen.getByRole("button", { name: "실행 취소" })).toBeDisabled();
});

test("adds, deletes and restores furniture with undo", () => {
  render(<SpaceStudioPage />);
  const count = sceneProps.room.items.length;
  openFurniture(); click("초록 친구 추가");
  expect(sceneProps.room.items).toHaveLength(count + 1);
  click("가구 삭제");
  expect(sceneProps.room.items).toHaveLength(count);
  click("실행 취소");
  expect(sceneProps.room.items).toHaveLength(count + 1);
});

test("saves memory edits and reloads them from this browser", () => {
  const { unmount } = render(<SpaceStudioPage />);
  click("추억 소품");
  click("추억 액자 추가");
  fireEvent.change(screen.getByLabelText("추억 이름"), { target: { value: "첫 합주" } });
  fireEvent.change(screen.getByLabelText("기억하고 싶은 이야기"), { target: { value: "끝까지 함께 연주한 날" } });
  click("저장");
  expect(screen.getByRole("status")).toHaveTextContent("이 브라우저에 공간을 저장했어요.");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "첫 합주", note: "끝까지 함께 연주한 날" })
  ]));
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room.items.some((item) => item.title === "첫 합주")).toBe(true);
});

test("a failed save retains edits and does not report success", () => {
  render(<SpaceStudioPage />);
  selectSofa();
  click("가구 오른쪽으로 이동");
  const edited = sceneProps.room;
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  click("저장");
  expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했어요");
  expect(sceneProps.room).toEqual(edited);
  expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();
});

test("themes, camera and decorative avatar settings update the scene", () => {
  render(<SpaceStudioPage />);
  click("위에서 보기");
  expect(sceneProps.view).toBe("top");
  click("벽과 바닥");
  click("초록 다락");
  expect(sceneProps.room.theme).toBe("sage");
  click("내 자리");
  click("라일락 후드");
  expect(sceneProps.room.avatarColor).toBe("#c991ba");
});

test("every action control carries a stable analytics identifier", () => {
  const { container } = render(<SpaceStudioPage />);
  for (const element of container.querySelectorAll("button,a,input,textarea,summary")) {
    expect(element.getAttribute("data-ph-capture-attribute-action")).toMatch(/^[a-z][a-z_]+$/);
  }
});

test("a successful save notice dismisses itself", () => {
  jest.useFakeTimers();
  try {
    render(<SpaceStudioPage />);
    click("저장");
    expect(screen.getByRole("status")).toHaveTextContent("이 브라우저에 공간을 저장했어요.");
    act(() => jest.advanceTimersByTime(3500));
    expect(screen.queryByText("이 브라우저에 공간을 저장했어요.")).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test("the template transition shows progress and blocks edits until the new scene is drawn", () => {
  render(<SpaceStudioPage />);
  click("아지트");
  expect(sceneProps.onThumbnails).toBeUndefined();
  click("클라이밍");
  click("이 아지트로 꾸미기");
  act(() => sceneProps.onTemplateTransition(true));
  expect(screen.getByText("아지트를 준비하고 있어요…")).toHaveRole("status");
  expect(screen.getByLabelText("공간 배치")).toHaveAttribute("aria-busy", "true");
  expect(sceneProps.interactive).toBe(false);
  click("실행 취소");
  expect(sceneProps.room.template).toBe("climbing");

  act(() => sceneProps.onTemplateTransition(false));
  expect(screen.queryByText("아지트를 준비하고 있어요…")).not.toBeInTheDocument();
  expect(screen.getByLabelText("공간 배치")).not.toHaveAttribute("aria-busy");
  click("실행 취소");
  expect(sceneProps.room.template).toBe("lounge");
  click("가구");
  expect(sceneProps.onThumbnails).toEqual(expect.any(Function));
});

test("chooses a hobby layout explicitly, keeps records, and undoes the entire layout change", () => {
  render(<SpaceStudioPage />);
  click("추억 소품");
  click("추억 액자 추가");
  fireEvent.change(screen.getByLabelText("추억 이름"), { target: { value: "함께한 하루" } });
  const before = sceneProps.room;
  click("아지트");
  click("클라이밍");
  expect(sceneProps.room).toEqual(before);
  click("이 아지트로 꾸미기");
  expect(sceneProps.room.template).toBe("climbing");
  expect(sceneProps.room.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: "함께한 하루" })]));
  click("실행 취소");
  expect(sceneProps.room).toEqual(before);
  click("다시 실행");
  click("저장");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).template).toBe("climbing");
});

test("hobby customization, upcoming note and all new controls keep action identifiers", () => {
  const { container } = render(<SpaceStudioPage />);
  function checkActions() {
    for (const element of container.querySelectorAll("button,a,input,textarea,summary")) {
      expect(element.getAttribute("data-ph-capture-attribute-action")).toMatch(/^[a-z][a-z_]+$/);
    }
  }
  click("아지트");
  checkActions();
  click("맛집 · 다이닝");
  click("이 아지트로 꾸미기");
  click("내 자리");
  click("라멘");
  fireEvent.change(screen.getByLabelText("모임 공지"), { target: { value: "다음에 먹을 메뉴를 골라요" } });
  checkActions();
  expect(sceneProps.room.food).toBe("ramen");
  click("저장");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).notice).toBe("다음에 먹을 메뉴를 골라요");
  click("아지트");
  click("클라이밍");
  click("이 아지트로 꾸미기");
  click("내 자리");
  click("홀드 색상 라일락");
  click("매트 색상 살구");
  expect(sceneProps.room).toMatchObject({ accentColor: "#c991ba", matColor: "#d99559" });
  checkActions();
});

test("unsafe record links are never clickable or saved", () => {
  render(<SpaceStudioPage />);
  click("추억 소품");
  click("추억 액자 추가");
  fireEvent.change(screen.getByLabelText("활동 기록 링크"), { target: { value: "javascript:alert(1)" } });
  expect(screen.queryByRole("link", { name: /활동 기록 열기/ })).not.toBeInTheDocument();
  click("저장");
  expect(screen.getByRole("alert")).toHaveTextContent("활동 기록 링크");
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  fireEvent.change(screen.getByLabelText("활동 기록 링크"), { target: { value: "https://example.com/record" } });
  expect(screen.getByRole("link", { name: /활동 기록 열기/ })).toHaveAttribute("rel", "noopener noreferrer");
  click("저장");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).items.at(-1).link).toBe("https://example.com/record");
});

test("a prepared photo preserves edits made while it loads and survives reload", async () => {
  let resolvePhoto;
  prepareRoomPhoto.mockImplementation(() => new Promise((resolve) => { resolvePhoto = resolve; }));
  const { unmount } = render(<SpaceStudioPage />);
  click("내 자리");
  fireEvent.change(screen.getByLabelText("대표 사진", { selector: "input" }), { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
  expect(screen.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("공간 이름"), { target: { value: "우리들의 식탁" } });
  await act(async () => resolvePhoto("data:image/jpeg;base64,YWJj"));
  expect(sceneProps.room).toMatchObject({ name: "우리들의 식탁", coverPhoto: "data:image/jpeg;base64,YWJj" });
  click("저장");
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room.coverPhoto).toBe("data:image/jpeg;base64,YWJj");
});

test.each(["취소", "가구", "아지트"])("pending photo cannot overwrite the room after %s", async (action) => {
  let resolvePhoto;
  prepareRoomPhoto.mockImplementation(() => new Promise((resolve) => { resolvePhoto = resolve; }));
  render(<SpaceStudioPage />);
  click("내 자리");
  fireEvent.change(screen.getByLabelText("대표 사진", { selector: "input" }), { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
  click(action);
  const expected = sceneProps.room;
  await act(async () => resolvePhoto("data:image/jpeg;base64,YWJj"));
  expect(sceneProps.room).toEqual(expected);
  expect(sceneProps.room.coverPhoto).toBe("");
});

test("a photo loading error leaves the record intact and allows saving again", async () => {
  prepareRoomPhoto.mockRejectedValue(new Error("사진을 읽지 못했어요."));
  render(<SpaceStudioPage />);
  click("추억 소품");
  click("추억 액자 추가");
  const expected = sceneProps.room;
  await act(async () => fireEvent.change(screen.getByLabelText("추억 사진", { selector: "input" }), {
    target: { files: [new File(["x"], "broken.png", { type: "image/png" })] }
  }));
  expect(sceneProps.room).toEqual(expected);
  expect(screen.getByRole("alert")).toHaveTextContent("사진을 읽지 못했어요");
  expect(screen.getByRole("button", { name: "저장", exact: true })).toBeEnabled();
});

test("slider previews stay live and a whole drag is one undo step", () => {
  render(<SpaceStudioPage />);
  click("분위기");
  const ambient = screen.getByRole("slider", { name: "공간 밝기" });
  fireEvent.focus(ambient);
  fireEvent.pointerDown(ambient);
  for (const value of [80, 65, 45]) fireEvent.change(ambient, { target: { value: String(value) } });
  expect(sceneProps.room.atmosphere.ambient).toBe(45);
  expect(ambient).toHaveAttribute("aria-valuetext", "45%");
  fireEvent.pointerUp(ambient);
  fireEvent.blur(ambient);
  click("실행 취소");
  expect(sceneProps.room.atmosphere).toEqual(DEFAULT_ATMOSPHERE);
  expect(screen.getByRole("button", { name: "실행 취소" })).toBeDisabled();
  click("다시 실행");
  expect(sceneProps.room.atmosphere.ambient).toBe(45);
});

test("atmosphere controls preview, save and reload their chosen values", () => {
  const { unmount, container } = render(<SpaceStudioPage />);
  click("분위기");
  const changes = [
    ["공간 밝기", "ambient", 75], ["햇빛 밝기", "sunlight", 130],
    ["빛의 따뜻함", "warmth", 30], ["햇빛 방향", "sunAngle", 150],
    ["전구 밝기", "lamps", 120], ["그림자 부드러움", "shadowSoftness", 85]
  ];
  for (const [label, field, value] of changes) {
    const slider = screen.getByRole("slider", { name: label });
    fireEvent.change(slider, { target: { value: String(value) } });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(sceneProps.room.atmosphere[field]).toBe(value);
  }
  fireEvent.change(screen.getByLabelText("배경 색상"), { target: { value: "#554477" } });
  click("단색");
  fireEvent.click(screen.getByRole("checkbox", { name: "그림자 켜기" }));
  fireEvent.change(screen.getByLabelText("벽 색상"), { target: { value: "#e5bba0" } });
  fireEvent.blur(screen.getByLabelText("벽 색상"));
  fireEvent.change(screen.getByLabelText("바닥 색상"), { target: { value: "#916a4c" } });
  for (const element of container.querySelectorAll("button,a,input,textarea,summary")) {
    expect(element.getAttribute("data-ph-capture-attribute-action")).toMatch(/^[a-z][a-z_]+$/);
  }
  const expected = sceneProps.room.atmosphere;
  expect(expected).toMatchObject({ backgroundColor: "#554477", backgroundStyle: "solid", shadows: false, wallColor: "#e5bba0", floorColor: "#916a4c" });
  expect(screen.getByRole("region", { name: "공간 배치" })).toHaveAttribute("data-background-style", "solid");
  expect(screen.getByRole("main")).toHaveStyle({ "--studio-background": "#554477" });
  click("저장");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).atmosphere).toEqual(expected);
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room.atmosphere).toEqual(expected);
});

test("presets and reset are reversible without changing furniture or records", () => {
  render(<SpaceStudioPage />);
  const items = sceneProps.room.items;
  click("분위기");
  const evening = ATMOSPHERE_PRESETS.find((preset) => preset.id === "evening");
  click(evening.name);
  expect(sceneProps.room.atmosphere).toEqual(evening.values);
  expect(sceneProps.room.items).toEqual(items);
  const slider = screen.getByRole("slider", { name: "전구 밝기" });
  fireEvent.change(slider, { target: { value: "60" } });
  click("분위기 기본값으로");
  expect(sceneProps.room.atmosphere).toEqual(DEFAULT_ATMOSPHERE);
  fireEvent.blur(slider);
  click("실행 취소");
  expect(sceneProps.room.atmosphere.lamps).toBe(60);
  click("실행 취소");
  expect(sceneProps.room.atmosphere).toEqual(evening.values);
});

test("surface color overrides reset independently to the selected theme", () => {
  render(<SpaceStudioPage />);
  click("벽과 바닥");
  click("초록 다락");
  click("분위기");
  fireEvent.change(screen.getByLabelText("벽 색상"), { target: { value: "#ffddaa" } });
  fireEvent.blur(screen.getByLabelText("벽 색상"));
  fireEvent.change(screen.getByLabelText("바닥 색상"), { target: { value: "#885533" } });
  click("벽 색상을 테마에 맞추기");
  expect(sceneProps.room.atmosphere).toMatchObject({ wallColor: "", floorColor: "#885533" });
  expect(screen.getByLabelText("벽 색상")).toHaveValue(THEMES.find((theme) => theme.id === "sage").wall);
  click("바닥 색상을 테마에 맞추기");
  expect(sceneProps.room.atmosphere.floorColor).toBe("");
  expect(screen.getByLabelText("바닥 색상")).toHaveValue(THEMES.find((theme) => theme.id === "sage").floor);
});

test("cancel clears an in-progress gesture and a late blur cannot restore it", () => {
  render(<SpaceStudioPage />);
  click("분위기");
  const slider = screen.getByRole("slider", { name: "공간 밝기" });
  fireEvent.focus(slider);
  fireEvent.change(slider, { target: { value: "20" } });
  click("취소");
  fireEvent.blur(slider);
  expect(sceneProps.room.atmosphere).toEqual(DEFAULT_ATMOSPHERE);
  expect(screen.getByRole("button", { name: "실행 취소" })).toBeDisabled();
});

test("switching templates commits a pending adjustment without undoing it prematurely", () => {
  render(<SpaceStudioPage />);
  click("분위기");
  fireEvent.change(screen.getByRole("slider", { name: "햇빛 밝기" }), { target: { value: "55" } });
  click("아지트");
  click("맛집 · 다이닝");
  click("이 아지트로 꾸미기");
  expect(sceneProps.room).toMatchObject({ template: "dining", atmosphere: TEMPLATE_ATMOSPHERES.dining });
  click("실행 취소");
  expect(sceneProps.room).toMatchObject({ template: "lounge", atmosphere: { sunlight: 55 } });
  click("실행 취소");
  expect(sceneProps.room.atmosphere).toEqual(DEFAULT_ATMOSPHERE);
});

test("an older saved room opens with atmosphere defaults and keeps its identity", () => {
  const previous = { version: 2, template: "climbing", name: "퇴근 후 한 홀드", theme: "sage", avatarColor: "#536bd6",
    items: [{ id: "old-plant", kind: "plant", x: 0, z: 0, rotation: 0 }] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(previous));
  render(<SpaceStudioPage />);
  expect(sceneProps.room).toMatchObject({ name: "퇴근 후 한 홀드", template: "climbing", atmosphere: DEFAULT_ATMOSPHERE });
  expect(sceneProps.room.version).toBe(10);
  expect(sceneProps.room.items.find((item) => item.id === "old-plant")).toEqual(previous.items[0]);
  expect(sceneProps.room.items.some((item) => item.kind === "climbingWallWide")).toBe(true);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual(previous);
  click("분위기");
  expect(screen.getByRole("slider", { name: "빛의 따뜻함" })).toHaveValue(String(DEFAULT_ATMOSPHERE.warmth));
});

test.each([
  ["배경 색상 코드", "backgroundColor"], ["벽 색상 코드", "wallColor"], ["바닥 색상 코드", "floorColor"]
])("%s accepts exact colors and rejects unfinished or invalid drafts", (label, field) => {
  render(<SpaceStudioPage />);
  click("분위기");
  const before = sceneProps.room.atmosphere;
  const code = screen.getByRole("textbox", { name: label });
  fireEvent.focus(code);
  fireEvent.change(code, { target: { value: "#B6C9DB" } });
  expect(sceneProps.room.atmosphere[field]).toBe("#b6c9db");
  fireEvent.change(code, { target: { value: "#AABBCC" } });
  expect(sceneProps.room.atmosphere[field]).toBe("#aabbcc");
  fireEvent.change(code, { target: { value: "#GGGGGG" } });
  expect(code).toHaveAttribute("aria-invalid", "true");
  expect(sceneProps.room.atmosphere[field]).toBe("#aabbcc");
  fireEvent.blur(code);
  expect(code).toHaveValue("#aabbcc");
  expect(code).toHaveAttribute("aria-invalid", "false");
  click("실행 취소");
  expect(sceneProps.room.atmosphere).toEqual(before);
  expect(screen.getByRole("button", { name: "실행 취소" })).toBeDisabled();
});

test("atmosphere editing reserves the history controls and hides furniture manipulation", () => {
  render(<SpaceStudioPage />);
  selectSofa();
  expect(screen.getByRole("toolbar", { name: "선택한 가구 조작" })).toBeInTheDocument();
  click("분위기");
  expect(screen.queryByRole("toolbar", { name: "선택한 가구 조작" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "공간 배치" })).toHaveClass("space-studio__stage--atmosphere");
  expect(screen.getByRole("toolbar", { name: "편집 이력" })).toBeInTheDocument();
});

test("first and third person modes keep editor panels out of the walking view", () => {
  const { container } = render(<SpaceStudioPage />);
  click("분위기");
  fireEvent.change(screen.getByRole("slider", { name: "공간 밝기" }), { target: { value: "70" } });
  const room = sceneProps.room;
  click("3인칭");
  expect(sceneProps.view).toBe("thirdPerson");
  expect(sceneProps.room).toEqual(room);
  expect(screen.getByRole("button", { name: "3인칭", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("navigation", { name: "꾸미기 종류" })).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "배경과 조명 설정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar", { name: "편집 이력" })).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar", { name: "선택한 가구 조작" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "위에서 보기" })).not.toBeInTheDocument();
  expect(screen.getByRole("toolbar", { name: "걷기 조작" })).toBeInTheDocument();
  for (const element of container.querySelectorAll("button,a")) {
    expect(element.getAttribute("data-ph-capture-attribute-action")).toMatch(/^[a-z][a-z_]+$/);
  }
  act(() => sceneProps.onWalkPosition({ x: 7, z: 2, zone: "휴게실" }));
  expect(screen.getByText("휴게실", { exact: true })).toBeInTheDocument();
  click("1인칭");
  expect(sceneProps.view).toBe("firstPerson");
  act(() => sceneProps.onExitWalk());
  expect(sceneProps.view).toBe("perspective");
  expect(screen.getByRole("complementary", { name: "배경과 조명 설정" })).toBeInTheDocument();
  click("실행 취소");
  expect(sceneProps.room.atmosphere.ambient).toBe(DEFAULT_ATMOSPHERE.ambient);
});

test("walking buttons issue separate commands and camera reset stays in walking mode", () => {
  render(<SpaceStudioPage />);
  click("3인칭");
  const commands = [
    ["앞으로 걷기", "forward"], ["뒤로 걷기", "backward"], ["왼쪽으로 걷기", "left"], ["오른쪽으로 걷기", "right"],
    ["왼쪽 바라보기", "turnLeft"], ["오른쪽 바라보기", "turnRight"], ["위 바라보기", "lookUp"], ["아래 바라보기", "lookDown"],
    ["시점 초기화", "reset"]
  ];
  commands.forEach(([label, action], index) => {
    click(label);
    expect(sceneProps.walkCommand).toEqual({ id: index + 1, action });
  });
  expect(sceneProps.view).toBe("thirdPerson");
  click("꾸미기");
  expect(sceneProps.view).toBe("perspective");
  expect(sceneProps.walkCommand).toBeNull();
  expect(screen.queryByRole("toolbar", { name: "걷기 조작" })).not.toBeInTheDocument();
});

test("the band rehearsal template can be selected before walking through it", () => {
  render(<SpaceStudioPage />);
  click("아지트");
  click("밴드");
  expect(screen.getByRole("button", { name: "밴드", exact: true })).toHaveAttribute("aria-pressed", "true");
  click("이 아지트로 꾸미기");
  expect(sceneProps.room.template).toBe("band");
  click("1인칭");
  expect(sceneProps.view).toBe("firstPerson");
  expect(sceneProps.room.template).toBe("band");
});

test("new furniture can be placed in the expanded lawn and saved without moving indoor furniture", () => {
  render(<SpaceStudioPage />);
  openFurniture(); click("마당에 놓기");
  openFurniture(); click("초록 친구 추가");
  expect(sceneProps.room.items.at(-1).z).toBeGreaterThan(5);
  expect(sceneProps.room.items.at(-1).z).toBeGreaterThan(8.2);
  expect(sceneProps.view).toBe("site");
  fireEvent.click(screen.getByRole("button", { name: /^(실내|1층)에 놓기$/ }));
  openFurniture(); click("초록 친구 추가");
  expect(sceneProps.room.items.at(-1).z).toBeLessThan(5);
  click("저장");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).items).toEqual(sceneProps.room.items);
});

test("default clubhouse floor views place furniture on the second floor and restore it after saving", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createInitialRoom("lounge", { loungeLoft: true })));
  const { unmount } = render(<SpaceStudioPage />);
  click("2층 라운지");
  expect(sceneProps.floorView).toBe("mezzanine");
  openFurniture();
  expect(screen.getByRole("button", { name: "2층에 놓기" })).toHaveAttribute("aria-pressed", "true");
  openFurniture(); click("초록 친구 추가");
  const plant = sceneProps.room.items.at(-1);
  expect(plant).toMatchObject({ kind: "plant", level: 1 });
  click("저장");
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room.items).toEqual(expect.arrayContaining([plant]));
});

test("climbing floor views place and save furniture on the mezzanine", () => {
  const { unmount, container } = render(<SpaceStudioPage />);
  click("아지트"); click("클라이밍"); click("이 아지트로 꾸미기");
  expect(screen.getByText("층고 12.4m · 468m²")).toBeInTheDocument();
  expect(sceneProps.floorView).toBe("all");
  click("중층 라운지");
  expect(sceneProps.floorView).toBe("mezzanine");
  openFurniture();
  expect(screen.getByRole("button", { name: "중층에 놓기" })).toHaveAttribute("aria-pressed", "true");
  openFurniture(); click("초록 친구 추가");
  const plant = sceneProps.room.items.at(-1);
  expect(plant).toMatchObject({ kind: "plant", level: 1 });
  for (const element of container.querySelectorAll("button,a,input,textarea,summary")) {
    expect(element.getAttribute("data-ph-capture-attribute-action")).toMatch(/^[a-z][a-z_]+$/);
  }
  click("저장");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).items).toEqual(expect.arrayContaining([plant]));
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room.items).toEqual(expect.arrayContaining([plant]));
  expect(sceneProps.floorView).toBe("all");
});

test("floor isolation follows selected furniture and walking restores the selected floor", () => {
  render(<SpaceStudioPage />);
  click("아지트"); click("클라이밍"); click("이 아지트로 꾸미기");
  click("중층 라운지");
  const ground = sceneProps.room.items.find((item) => item.level !== 1 && item.z < 5);
  act(() => sceneProps.onSelect(ground.id));
  expect(sceneProps.floorView).toBe("ground");
  openFurniture();
  expect(screen.getByRole("button", { name: "1층에 놓기" })).toHaveAttribute("aria-pressed", "true");
  const upper = sceneProps.room.items.find((item) => item.level === 1);
  act(() => sceneProps.onSelect(upper.id));
  expect(sceneProps.floorView).toBe("mezzanine");
  click("1층 메인 공간");
  expect(sceneProps.selectedId).toBeNull();
  act(() => sceneProps.onSelect(ground.id));
  click("중층에 놓기");
  expect(sceneProps.selectedId).toBeNull();
  expect(sceneProps.floorView).toBe("mezzanine");
  click("1인칭");
  expect(screen.queryByRole("navigation", { name: "꾸밀 층 보기" })).not.toBeInTheDocument();
  act(() => sceneProps.onWalkPosition({ x: 8, y: 4.2, z: -4, zone: "중층 라운지" }));
  expect(screen.getByText("중층 라운지", { exact: true })).toBeInTheDocument();
  click("꾸미기");
  expect(sceneProps.floorView).toBe("mezzanine");
  openFurniture(); click("마당에 놓기");
  expect(sceneProps.floorView).toBe("all");
  openFurniture(); click("초록 친구 추가");
  expect(sceneProps.room.items.at(-1)).toMatchObject({ level: 0 });
  expect(sceneProps.room.items.at(-1).z).toBeGreaterThan(5);
});

test("template changes, undo and cancel reset the active placement floor", () => {
  render(<SpaceStudioPage />);
  click("아지트"); click("클라이밍"); click("이 아지트로 꾸미기");
  click("중층 라운지");
  click("실행 취소");
  expect(sceneProps.room.template).toBe("lounge");
  expect(sceneProps.floorView).toBe("all");
  expect(screen.queryByRole("button", { name: "중층에 놓기" })).not.toBeInTheDocument();
  openFurniture();
  expect(screen.getByRole("button", { name: /^(실내|1층)에 놓기$/ })).toHaveAttribute("aria-pressed", "true");
  click("다시 실행"); click("중층 라운지");
  click("아지트"); click("밴드"); click("이 아지트로 꾸미기");
  expect(sceneProps.floorView).toBe("all");
  expect(screen.getByRole("navigation", { name: "꾸밀 층 보기" })).toBeInTheDocument();
  click("중층 라운지");
  expect(sceneProps.floorView).toBe("mezzanine");
  click("취소");
  expect(sceneProps.room.template).toBe("lounge");
  expect(sceneProps.floorView).toBe("all");
  openFurniture(); click("초록 친구 추가");
  expect(sceneProps.room.items.at(-1).level ?? 0).toBe(0);
});


test("boardgame applies its library layout and evening atmosphere, with editable upper-floor assets", () => {
  const { unmount } = render(<SpaceStudioPage />);
  click("아지트"); click("보드게임"); click("이 아지트로 꾸미기");
  expect(sceneProps.room.template).toBe("boardgame");
  expect(screen.getByText("층고 9.4m · 440m²")).toBeInTheDocument();
  expect(sceneProps.room.atmosphere).toEqual(TEMPLATE_ATMOSPHERES.boardgame);
  click("중층 라운지"); openFurniture(); click("초록 친구 추가");
  const upper = sceneProps.room.items.at(-1);
  expect(upper.level).toBe(1);
  click("저장"); unmount(); render(<SpaceStudioPage />);
  expect(sceneProps.room.items).toEqual(expect.arrayContaining([upper]));
  expect(sceneProps.room.atmosphere.backgroundColor).toBe(TEMPLATE_ATMOSPHERES.boardgame.backgroundColor);
  click("분위기"); click("맑은 낮"); click("분위기 기본값으로");
  expect(sceneProps.room.atmosphere).toEqual(TEMPLATE_ATMOSPHERES.boardgame);
});

test("whole-site view leaves floor isolation and shows the building and entrance without moving furniture", () => {
  render(<SpaceStudioPage />);
  click("아지트"); click("보드게임"); click("이 아지트로 꾸미기");
  const items = sceneProps.room.items;
  click("중층 라운지"); click("공간 전체 보기");
  expect(sceneProps.floorView).toBe("all");
  expect(sceneProps.view).toBe("site");
  expect(sceneProps.room.items).toEqual(items);
  click("시점 초기화"); expect(sceneProps.view).toBe("perspective");
});


test("selecting outdoor furniture fits the island and exits upper-floor isolation", () => {
  render(<SpaceStudioPage />);
  click("아지트"); click("보드게임"); click("이 아지트로 꾸미기");
  click("중층 라운지");
  const outdoor = sceneProps.room.items.find((item) => item.z > 5);
  act(() => sceneProps.onSelect(outdoor.id));
  expect(sceneProps.view).toBe("site");
  expect(sceneProps.floorView).toBe("all");
  openFurniture();
  expect(screen.getByRole("button", { name: "마당에 놓기" })).toHaveAttribute("aria-pressed", "true");
  click("1층에 놓기");
  expect(sceneProps.view).toBe("perspective");
  openFurniture(); click("마당에 놓기");
  expect(sceneProps.view).toBe("site");
});

test("cross-theme catalog filtering and search add another club's equipment without changing the room preset", () => {
  const { unmount } = render(<SpaceStudioPage />);
  const initialItems = sceneProps.room.items;
  openFurniture();
  const collections = within(screen.getByRole("group", { name: "에셋 모음" }));
  fireEvent.click(collections.getByRole("button", { name: "밴드", exact: true }));
  expect(screen.getByRole("button", { name: "기타 앰프 스택 추가" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "카메라와 삼각대 추가" })).not.toBeInTheDocument();
  fireEvent.click(collections.getByRole("button", { name: "사진", exact: true }));
  expect(screen.queryByRole("button", { name: "기타 앰프 스택 추가" })).not.toBeInTheDocument();
  const search = screen.getByRole("textbox", { name: "가구와 시설 검색" });
  expect(search).toHaveAttribute("data-ph-capture-attribute-action", "space_asset_search");
  fireEvent.change(search, { target: { value: "삼각대" } });
  expect(screen.getByRole("button", { name: "카메라와 삼각대 추가" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "팔각 소프트박스 추가" })).not.toBeInTheDocument();
  expect(sceneProps.room.items).toEqual(initialItems);
  click("카메라와 삼각대 추가");
  const added = sceneProps.room.items.at(-1);
  expect(added.kind).toBe("photoTripod");
  expect(sceneProps.room.template).toBe("lounge");
  expect(sceneProps.room.items).toHaveLength(initialItems.length + 1);
  click("저장");
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room.template).toBe("lounge");
  expect(sceneProps.room.items.find((item) => item.id === added.id)).toEqual(added);
});

test("a v8 library becomes selectable assets and deleted shelves stay deleted after explicit save", () => {
  const previous = { ...createInitialRoom("boardgame"), version: 8, name: "우리 게임 아지트",
    items: [{ id: "old-chair", kind: "armchair", x: -5.4, z: -2.4, rotation: 0 }] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(previous));
  const { unmount } = render(<SpaceStudioPage />);
  expect(sceneProps.room).toMatchObject({ version: 10, name: previous.name, template: "boardgame" });
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual(previous);
  for (const item of previous.items) expect(sceneProps.room.items.find((entry) => entry.id === item.id)).toEqual(item);
  const shelf = sceneProps.room.items.find((item) => item.kind === "libraryShelfWood");
  expect(shelf).toBeDefined();
  act(() => sceneProps.onSelect(shelf.id));
  expect(screen.getByRole("toolbar", { name: "선택한 가구 조작" })).toHaveTextContent("원목 게임 라이브러리");
  click("가구 삭제");
  expect(sceneProps.room.items.some((item) => item.id === shelf.id)).toBe(false);
  click("저장");
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  expect(saved.version).toBe(10);
  unmount();
  render(<SpaceStudioPage />);
  expect(sceneProps.room).toEqual(saved);
  expect(sceneProps.room.items.some((item) => item.id === shelf.id)).toBe(false);
});

test.each([
  ["맛집 · 다이닝", "dining", "kitchenIsland"],
  ["밴드", "band", "drumKit"],
  ["개발 · 스터디", "study", "studyDesk"],
  ["사진", "photo", "photoBackdrop"]
])("%s preset opens its facilities, loft and music console through the actual chooser", (label, template, facility) => {
  render(<SpaceStudioPage />);
  click("아지트"); click(label); click("이 아지트로 꾸미기");
  expect(sceneProps.room.template).toBe(template);
  expect(sceneProps.room.items.some((item) => item.kind === facility)).toBe(true);
  expect(sceneProps.room.items.some((item) => item.kind === "musicConsole")).toBe(true);
  expect(sceneProps.room.atmosphere).toEqual(TEMPLATE_ATMOSPHERES[template]);
  click("중층 라운지");
  expect(sceneProps.floorView).toBe("mezzanine");
  openFurniture();
  expect(screen.getByRole("button", { name: "중층에 놓기" })).toHaveAttribute("aria-pressed", "true");
});

test("integrated editing shows only save and done and keeps its sliding menu inert when collapsed", () => {
  const onModeChange = jest.fn();
  render(<SpaceStudioPage groupContext={groupContext} clubhouse={{ mode: "decorate", onModeChange }} />);
  const scene = screen.getByTestId("room-scene");
  expect(screen.getByRole("button", { name: "저장", exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "완료", exact: true })).toBeVisible();
  expect(screen.queryByRole("toolbar", { name: "편집 이력" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "취소", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "꾸미기 도구" })).not.toBeInTheDocument();
  expect(document.getElementById("space-hud-menu")).toHaveAttribute("inert");
  click("메뉴 펼치기"); click("내 자리");
  const name = screen.getByRole("textbox", { name: "공간 이름" });
  fireEvent.change(name, { target: { value: "우리 모임 초안" } });
  const editHistory = within(screen.getByRole("toolbar", { name: "편집 이력" }));
  fireEvent.click(editHistory.getByRole("button", { name: "실행 취소" }));
  expect(editHistory.getByRole("button", { name: "다시 실행" })).toBeEnabled();
  fireEvent.click(editHistory.getByRole("button", { name: "다시 실행" }));
  click("메뉴 접기");
  expect(document.getElementById("space-hud-menu")).toHaveAttribute("inert");
  expect(screen.queryByRole("textbox", { name: "공간 이름" })).not.toBeInTheDocument();
  click("메뉴 펼치기");
  expect(document.getElementById("space-hud-menu")).not.toHaveAttribute("inert");
  expect(screen.getByRole("textbox", { name: "공간 이름" })).toBe(name);
  expect(name).toHaveValue("우리 모임 초안");
  expect(screen.getByTestId("room-scene")).toBe(scene);
  click("완료");
  expect(onModeChange).toHaveBeenCalledWith("use");
  expect(sceneProps.room.name).toBe("우리 모임 초안");
});

test("integrated View groups camera tools while exterior and lighting stay available when closed", () => {
  render(<SpaceStudioPage initialRoom={createInitialRoom("climbing")} groupContext={groupContext}
    clubhouse={{ mode: "decorate", onModeChange: jest.fn() }} />);
  const items = sceneProps.room.items;
  const scene = screen.getByTestId("room-scene");
  expect(screen.queryByRole("button", { name: "중층 라운지" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "UI 접기" })).toBeVisible();
  click("전체 조명"); expect(sceneProps.generalLighting).toBe(false);
  click("건물 외관"); expect(sceneProps.view).toBe("exterior");
  click("건물 외관"); expect(sceneProps.view).toBe("perspective");
  click("시점 도구 펼치기");
  const viewTools = within(screen.getByRole("group", { name: "층과 카메라 설정" }));
  for (const name of ["전체 보기", "1층 메인 공간", "중층 라운지", "입체로 보기", "위에서 보기"]) {
    expect(viewTools.getByRole("button", { name, exact: true })).toBeVisible();
  }
  click("중층 라운지"); expect(sceneProps.floorView).toBe("mezzanine");
  click("1층 메인 공간"); expect(sceneProps.floorView).toBe("ground");
  click("전체 보기"); expect(sceneProps.floorView).toBe("all");
  click("위에서 보기"); expect(sceneProps.view).toBe("top");
  click("건물 외관"); expect(sceneProps.view).toBe("exterior");
  click("건물 외관"); expect(sceneProps.view).toBe("top");
  click("입체로 보기"); expect(sceneProps.view).toBe("perspective");
  click("전체 조명"); expect(sceneProps.generalLighting).toBe(true);
  fireEvent.change(viewTools.getByRole("slider", { name: "광각 시야" }), { target: { value: "24" } });
  expect(sceneProps.studioWideAngle).toBe(24);
  click("시점 도구 접기");
  expect(screen.queryByRole("toolbar", { name: "시점 조절" })).not.toBeInTheDocument();
  expect(sceneProps.room.items).toBe(items);
  expect(screen.getByTestId("room-scene")).toBe(scene);
});

test("ordinary setting notices expire, newer notices restart the timer, and errors stay readable", () => {
  jest.useFakeTimers();
  try {
    render(<SpaceStudioPage />);
    click("아지트"); click("클라이밍"); click("이 아지트로 꾸미기");
    expect(screen.getByRole("status")).toHaveTextContent("아지트를 바꿨어요");
    expect(screen.queryByRole("button", { name: "알림 닫기" })).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2500));
    click("취소");
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toHaveTextContent("마지막으로 저장한 모습");
    act(() => jest.advanceTimersByTime(2500));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => sceneProps.onInvalid());
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole("alert")).toHaveTextContent("여기에는 놓을 수 없어요");
  } finally { jest.useRealTimers(); }
});

test("integrated menu and View are mutually exclusive without discarding the mounted draft", () => {
  render(<SpaceStudioPage groupContext={groupContext} clubhouse={{ mode: "decorate", onModeChange: jest.fn() }} />);
  click("메뉴 펼치기"); click("내 자리");
  const draft = screen.getByRole("textbox", { name: "공간 이름" });
  fireEvent.change(draft, { target: { value: "계속 꾸미는 아지트" } });
  click("시점 도구 펼치기");
  expect(screen.getByRole("button", { name: "메뉴 펼치기" })).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("space-hud-menu")).toHaveAttribute("inert");
  expect(screen.queryByRole("textbox", { name: "공간 이름" })).not.toBeInTheDocument();
  expect(screen.getByRole("toolbar", { name: "시점 조절" })).toBeVisible();
  click("메뉴 펼치기");
  expect(screen.getByRole("button", { name: "시점 도구 펼치기" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("toolbar", { name: "시점 조절" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "공간 이름" })).toBe(draft);
  expect(draft).toHaveValue("계속 꾸미는 아지트");
});
