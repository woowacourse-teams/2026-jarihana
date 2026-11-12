import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { SpaceStudioPage } from "./SpaceStudioPage";
import { ROOM_LIGHT_SWITCH_ID } from "./clubhouseInteractions";
import { DEFAULT_ROOM_ZOOM } from "./roomCameraZoom";
import { createInitialRoom, findOpenPosition, validateRoom } from "./roomState";

let sceneProps;
const mockOpenMusic = jest.fn();
jest.mock("react-router", () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock("../../features/group-music/index.js", () => ({ useGroupMusic: () => ({ openMusic: mockOpenMusic }) }));
jest.mock("./RoomCanvas", () => ({ RoomCanvas: (props) => { sceneProps = props; return <div data-testid="room-scene" />; } }));

const groupContext = { id: 42, name: "우리 모임", memberCount: 8, backHref: "/groups/42", membersHref: "/groups/42?tab=members" };
function options() {
  const room = createInitialRoom();
  room.items.push({ id: "activity-frame", kind: "memory", title: "첫 모임", note: "기록", photo: "", link: "https://example.com/groups/42?tab=activities&activity=12", ...findOpenPosition("memory", room.items, room, "building"), rotation: 0 });
  expect(validateRoom(room)).toEqual(room);
  return { initialRoom: room, groupContext, onSave: jest.fn(), canEdit: true,
    clubhouse: { mode: "use", onModeChange: jest.fn(), onOpenFeature: jest.fn(),
      overlay: <aside aria-label="모임 패널">패널 내용</aside> } };
}

beforeEach(() => { mockOpenMusic.mockReset(); });

test("the building sign follows the actual group name independently of the saved room name", () => {
  const props = options();
  const { rerender } = render(<SpaceStudioPage {...props} />);
  expect(sceneProps.signName).toBe("우리 모임");
  expect(sceneProps.room.name).not.toBe(sceneProps.signName);
  const originalRoom = sceneProps.room;
  rerender(<SpaceStudioPage {...props} groupContext={{ ...groupContext, name: "함께 오르는 우리" }} />);
  expect(sceneProps.signName).toBe("함께 오르는 우리");
  expect(sceneProps.room).toBe(originalRoom);
  expect(props.onSave).not.toHaveBeenCalled();
});

test("a visitor can toggle the same light from settings and the first-person wall switch", () => {
  const props = options();
  render(<SpaceStudioPage {...props} canEdit={false} />);
  fireEvent.click(screen.getByRole("button", { name: "시점 설정" }));
  const button = screen.getByRole("button", { name: /전체 조명/ });
  const originalRoom = sceneProps.room;
  expect(button).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(button);
  expect(sceneProps.generalLighting).toBe(false);
  expect(button).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "시점 설정" }));
  expect(sceneProps.view).toBe("firstPerson");
  act(() => sceneProps.onSelect(ROOM_LIGHT_SWITCH_ID));
  expect(sceneProps.generalLighting).toBe(true);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(sceneProps.room).toBe(originalRoom);
  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.clubhouse.onOpenFeature).not.toHaveBeenCalled();
});

test("common objects open their matching feature without entering decoration", () => {
  const props = options();
  render(<SpaceStudioPage {...props} />);
  for (const [kind, feature] of [["clubDashboard", "dashboard"], ["activityBoard", "activities"]]) {
    const item = sceneProps.room.items.find((entry) => entry.kind === kind);
    act(() => sceneProps.onSelect(item.id));
    expect(props.clubhouse.onOpenFeature).toHaveBeenLastCalledWith(feature, item);
  }
  act(() => sceneProps.onSelect(sceneProps.room.items.find((item) => item.kind === "musicConsole").id));
  expect(mockOpenMusic).toHaveBeenCalledTimes(1);
  expect(sceneProps.editable).toBe(false);
});

test("the common collection repairs a saved room in one undoable edit", () => {
  const props = options();
  props.initialRoom.items = props.initialRoom.items.filter((item) => !["activityBoard", "clubDashboard"].includes(item.kind));
  props.initialRoom.notice = "다음 모임은 토요일";
  render(<SpaceStudioPage {...props} clubhouse={{ ...props.clubhouse, mode: "decorate" }} />);
  const original = sceneProps.room;
  fireEvent.click(screen.getByRole("button", { name: "메뉴 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "공통 기능", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "빠진 공통 에셋 2개 추가" }));
  expect(sceneProps.room.items.slice(0, original.items.length)).toEqual(original.items);
  expect(sceneProps.room.items).toHaveLength(original.items.length + 2);
  expect(sceneProps.room.notice).toBe(original.notice);
  expect(screen.getByRole("button", { name: "공통 에셋이 모두 있어요" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
  expect(sceneProps.room).toEqual(original);
});

test("notice editing requests focus the existing saved-room field only once", () => {
  const props = options();
  const clubhouse = { ...props.clubhouse, mode: "decorate", editNoticeRequest: "notice-1" };
  const { rerender } = render(<SpaceStudioPage {...props} clubhouse={clubhouse} />);
  expect(screen.getByLabelText("모임 공지")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("모임 공지"), { target: { value: "새 모임 공지" } });
  fireEvent.click(screen.getByRole("button", { name: "공통 기능", exact: true }));
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...clubhouse, mode: "use" }} />);
  rerender(<SpaceStudioPage {...props} clubhouse={clubhouse} />);
  expect(screen.getByRole("complementary", { name: "공통 기능 에셋" })).toBeInTheDocument();
  expect(sceneProps.room.notice).toBe("새 모임 공지");
});

test("use mode opens the shared feature while blocking all furniture edits", () => {
  const props = options();
  render(<SpaceStudioPage {...props} />);
  const frame = props.initialRoom.items.find((item) => item.id === "activity-frame");
  expect(sceneProps.editable).toBe(false);
  expect(screen.queryByRole("button", { name: "활동 기록" })).not.toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "모임 패널" })).toHaveTextContent("패널 내용");
  act(() => sceneProps.onSelect(frame.id));
  expect(props.clubhouse.onOpenFeature).toHaveBeenCalledWith("activities", frame);
  expect(screen.queryByRole("toolbar", { name: "선택한 가구 조작" })).not.toBeInTheDocument();
  const original = sceneProps.room;
  act(() => sceneProps.onMove("sofa", 0, 0));
  expect(sceneProps.room).toEqual(original);

});

test("switching modes retains the unsaved draft and edit clicks never open activities", () => {
  const props = options();
  const { rerender } = render(<SpaceStudioPage {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "메뉴 펼치기" }));
  expect(within(screen.getByRole("navigation", { name: "아지트 메뉴" })).getByRole("button", { name: "활동 기록" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "인사", exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "시점 설정" }));
  expect(screen.queryByRole("navigation", { name: "아지트 메뉴" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "3인칭" }));
  expect(screen.queryByRole("navigation", { name: "꾸미기 도구" })).not.toBeInTheDocument();
  expect(sceneProps.focusBuilding).toBe(false);
  act(() => sceneProps.onZoomChange(DEFAULT_ROOM_ZOOM / 2));
  fireEvent.click(screen.getByRole("button", { name: "꾸미기", exact: true }));
  expect(props.clubhouse.onModeChange).toHaveBeenCalledWith("decorate");
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...props.clubhouse, mode: "decorate" }} />);
  expect(sceneProps.editable).toBe(true);
  expect(sceneProps).toMatchObject({
    focusBuilding: true, view: "perspective", floorView: "all", zoom: DEFAULT_ROOM_ZOOM
  });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 펼치기" }));
  expect(within(screen.getByRole("navigation", { name: "꾸미기 도구" })).getByRole("button", { name: "가구" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "시점 설정" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "완료" })).toBeVisible();
  act(() => sceneProps.onSelect("activity-frame"));
  expect(props.clubhouse.onOpenFeature).not.toHaveBeenCalled();
  expect(screen.getByLabelText("추억 이름")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("추억 이름"), { target: { value: "바꾼 액자 제목" } });
  const draft = sceneProps.room;
  fireEvent.click(screen.getByRole("button", { name: "완료" }));
  expect(props.clubhouse.onModeChange).toHaveBeenLastCalledWith("use");
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...props.clubhouse, mode: "use" }} />);
  expect(sceneProps.editable).toBe(false);
  expect(sceneProps.focusBuilding).toBe(false);
  expect(sceneProps.selectedId).toBeNull();
  expect(sceneProps.room).toEqual(draft);
  fireEvent.click(screen.getByRole("button", { name: "시점 설정" }));
  expect(screen.getByRole("button", { name: "3인칭" })).toHaveAttribute("aria-pressed", "true");
  expect(sceneProps).toMatchObject({ view: "thirdPerson", preserveWalkPose: true });
  expect(screen.queryByRole("button", { name: "저장", exact: true })).not.toBeInTheDocument();
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...props.clubhouse, mode: "decorate" }} />);
  act(() => sceneProps.onSelect("activity-frame"));
  expect(screen.getByLabelText("추억 이름")).toHaveValue("바꾼 액자 제목");
});

test("displaying and removing an activity frame changes room state only and can be undone", () => {
  const props = options();
  const onRecordDisplayed = jest.fn();
  const request = { requestId: "display-55", link: "https://example.com/groups/42?tab=activities&post=55" };
  render(<SpaceStudioPage {...props} clubhouse={{ ...props.clubhouse, mode: "decorate", displayRecord: request, onRecordDisplayed }} />);
  expect(onRecordDisplayed).toHaveBeenCalledTimes(1);
  const frame = sceneProps.room.items.find((item) => item.link === request.link);
  expect(frame).toMatchObject({ title: "활동 기록", note: "", photo: "" });
  expect(sceneProps.room.items).toHaveLength(props.initialRoom.items.length + 1);
  fireEvent.click(screen.getByRole("button", { name: "가구 삭제" }));
  expect(sceneProps.room.items).toHaveLength(props.initialRoom.items.length);
  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.clubhouse.onOpenFeature).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
  expect(sceneProps.room.items.find((item) => item.id === frame.id)).toEqual(frame);
});

test("a member cannot activate decorate mode even when parent requests it", () => {
  const props = options();
  render(<SpaceStudioPage {...props} canEdit={false} clubhouse={{ ...props.clubhouse, mode: "decorate" }} />);
  expect(sceneProps.editable).toBe(false);
  expect(screen.queryByRole("button", { name: "꾸미기", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "저장", exact: true })).not.toBeInTheDocument();
});

function navigationOptions() {
  const props = options();
  const navigate = jest.fn();
  const onClick = (event) => {
    const blocked = event.defaultPrevented;
    event.preventDefault();
    if (!blocked) navigate(event.currentTarget.getAttribute("href"));
  };
  props.clubhouse = { ...props.clubhouse, mode: "decorate",
    overlay: <aside aria-label="모임 패널">
      <a href="/groups" onClick={onClick}>모임 목록</a>
      <a href="/groups/42/manage" onClick={onClick}>모임 수정</a>
      <a href={`${window.location.pathname}?panel=activities#record`} onClick={onClick}>활동 패널</a>
    </aside> };
  return { props, navigate };
}

function editFrame() {
  act(() => sceneProps.onSelect("activity-frame"));
  fireEvent.change(screen.getByLabelText("추억 이름"), { target: { value: "저장 전 액자" } });
}

test("clubhouse exits can be cancelled without losing the room draft, then approved once", () => {
  const { props, navigate } = navigationOptions();
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  try {
    render(<SpaceStudioPage {...props} />);
    editFrame();
    const draft = sceneProps.room;
    fireEvent.click(screen.getByRole("link", { name: "모임 목록" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(sceneProps.room).toEqual(draft);
    expect(screen.getByLabelText("추억 이름")).toHaveValue("저장 전 액자");
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "모임 수정" }));
    expect(navigate).toHaveBeenCalledWith("/groups/42/manage");
    expect(confirm).toHaveBeenCalledTimes(2);
  } finally { confirm.mockRestore(); }
});

test("panel query/hash and new-tab clicks do not trigger the room exit prompt", () => {
  const { props, navigate } = navigationOptions();
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  try {
    render(<SpaceStudioPage {...props} />);
    editFrame();
    fireEvent.click(screen.getByRole("link", { name: "활동 패널" }));
    fireEvent.click(screen.getByRole("link", { name: "모임 목록" }), { ctrlKey: true });
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  } finally { confirm.mockRestore(); }
});

test("clubhouse navigation is blocked while the room is saving without another prompt", async () => {
  const { props, navigate } = navigationOptions();
  props.initialRoom = createInitialRoom();
  let finishSave;
  props.onSave = jest.fn(() => new Promise((resolve) => { finishSave = resolve; }));
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<SpaceStudioPage {...props} />);
    act(() => sceneProps.onSelect("sofa"));
    fireEvent.click(screen.getByRole("button", { name: "가구 오른쪽으로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "저장", exact: true }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", { name: "모임 목록" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => finishSave(sceneProps.room));
    fireEvent.click(screen.getByRole("link", { name: "모임 목록" }));
    expect(navigate).toHaveBeenCalledWith("/groups");
    expect(confirm).not.toHaveBeenCalled();
  } finally { confirm.mockRestore(); }
});

test("the web hero allows camera navigation without editing and preserves assets across expand and collapse", () => {
  const props = options();
  const onDirtyChange = jest.fn();
  const onHudHiddenChange = jest.fn();
  const web = { ...props.clubhouse, presentation: "web", onDirtyChange, onHudHiddenChange };
  const immersive = { ...web, presentation: "immersive", mode: "decorate" };
  const { rerender } = render(<SpaceStudioPage {...props} clubhouse={web} />);
  const scene = screen.getByTestId("room-scene");
  expect(sceneProps).toMatchObject({ view: "front", zoom: 1, interactive: true, editable: false });
  expect(screen.queryByRole("button", { name: "UI 접기" })).not.toBeInTheDocument();
  rerender(<SpaceStudioPage {...props} clubhouse={immersive} />);
  expect(sceneProps).toMatchObject({ view: "perspective", zoom: 0.7, interactive: true, editable: true });
  fireEvent.click(screen.getByRole("button", { name: "시점 도구 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "UI 접기" }));
  expect(onHudHiddenChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "UI 펼치기" }));
  expect(onHudHiddenChange).toHaveBeenLastCalledWith(false);
  act(() => sceneProps.onSelect("activity-frame"));
  fireEvent.change(screen.getByLabelText("추억 이름"), { target: { value: "계속 남아 있는 초안" } });
  const draft = sceneProps.room;
  expect(onDirtyChange).toHaveBeenLastCalledWith(true, false);
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...immersive, presentation: "web" }} />);
  expect(sceneProps).toMatchObject({ view: "front", interactive: true, editable: false });
  expect(sceneProps.room).toBe(draft);
  rerender(<SpaceStudioPage {...props} clubhouse={immersive} />);
  expect(screen.getByLabelText("추억 이름")).toHaveValue("계속 남아 있는 초안");
  expect(screen.getByTestId("room-scene")).toBe(scene);
});

test("live photo slots and the side menu open the same panel, and menus suspend movement", () => {
  const props = options();
  const { rerender } = render(<SpaceStudioPage {...props} />);
  const slot = { kind: "memory", link: "/groups/42?panel=activities&activity=55", title: "최근 활동" };
  act(() => sceneProps.onSelect(slot));
  expect(props.clubhouse.onOpenFeature).toHaveBeenCalledWith("activities", slot);
  expect(screen.queryByRole("button", { name: "시점 도구 펼치기" })).not.toBeInTheDocument();
  const menu = screen.getByRole("button", { name: "메뉴 펼치기" });
  fireEvent.click(menu);
  expect(sceneProps.walkInputBlocked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "활동 기록" }));
  expect(props.clubhouse.onOpenFeature).toHaveBeenLastCalledWith("activities");
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...props.clubhouse, inputBlocked: true }} />);
  expect(sceneProps.walkInputBlocked).toBe(true);
  rerender(<SpaceStudioPage {...props} />);
  expect(sceneProps.walkInputBlocked).toBe(false);
  const settings = screen.getByRole("button", { name: "시점 설정" });
  fireEvent.click(settings);
  expect(sceneProps.walkInputBlocked).toBe(true);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(settings).toHaveFocus();
  expect(sceneProps.walkInputBlocked).toBe(false);
  expect(settings).toHaveAttribute("aria-expanded", "false");
  const help = screen.getByRole("button", { name: "조작 도움말" });
  help.focus();
  fireEvent.click(help);
  expect(screen.getByRole("dialog", { name: "조작 도움말" })).toBeVisible();
  expect(sceneProps.walkInputBlocked).toBe(true);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "닫기" }));
  expect(sceneProps.walkInputBlocked).toBe(false);
  expect(help).toHaveFocus();
});

test("visiting from the web hero keeps the canvas and hands control to first person after the camera flight", () => {
  const props = options();
  const web = { ...props.clubhouse, presentation: "web" };
  const immersive = { ...web, presentation: "immersive" };
  const flight = { duration: 720, finish: jest.fn() };
  const { rerender } = render(<SpaceStudioPage {...props} clubhouse={web} />);
  const canvas = screen.getByTestId("room-scene");
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...immersive, cameraFlight: flight }} />);
  expect(sceneProps).toMatchObject({ view: "firstPerson", cameraFlight: flight, interactive: false, editable: false });
  rerender(<SpaceStudioPage {...props} clubhouse={immersive} />);
  expect(sceneProps).toMatchObject({ view: "firstPerson", interactive: true });
  expect(screen.getByTestId("room-scene")).toBe(canvas);
  fireEvent.click(screen.getByRole("button", { name: "점프" }));
  expect(sceneProps.walkCommand).toMatchObject({ action: "jump" });
  rerender(<SpaceStudioPage {...props} clubhouse={{ ...web, cameraFlight: flight }} />);
  expect(sceneProps).toMatchObject({ view: "front", interactive: false });
});
