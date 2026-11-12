import { act, fireEvent, render, screen } from "@testing-library/react";

import { GroupDetailPage } from "../../../src/pages/groups/GroupDetailPage.jsx";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";
import * as authHooks from "../../../src/features/auth/index.js";
import * as groupHooks from "../../../src/features/group/index.js";
import * as spaceHooks from "../../../src/features/group-space/index.js";
import { createInitialRoom } from "../../../src/pages/space/roomState.js";
import { GroupSpaceLoader as MockGroupSpaceLoader } from "../../../src/pages/space/GroupSpacePage.jsx";
import * as memberHooks from "../../../src/features/member/index.js";
import * as recruitmentHooks from "../../../src/features/recruitment/index.js";
import * as registrationHooks from "../../../src/features/registration/index.js";

const mockNavigate = jest.fn();
let mockLocation = { pathname: "/groups/41", search: "", state: null };

jest.mock("../../../src/pages/groups/GroupClubhouse.jsx", () => ({
  __esModule: true,
  default: ({ auth, children, group, groupId, setup }) => <>
    <h1 id="group-title" tabIndex={-1}>{group.name}</h1>
    <MockGroupSpaceLoader groupId={groupId} memberId={auth.member?.id} setup={setup} clubhouse={{ inputBlocked: false }} />
    {children}
  </>,
  GroupPhotoDetail: ({ children, group }) => <><h1 id="group-title" tabIndex={-1}>{group.name}</h1>{children}</>
}));

jest.mock(
  "react-router",
  () => ({
    Link: ({ children, to, viewTransition: _viewTransition, ...props }) => (
      <a href={typeof to === "string" ? to : "/"} {...props}>
        {children}
      </a>
    ),
    useLocation: () => mockLocation,
    useNavigate: () => mockNavigate,
    useParams: () => ({ groupId: "41" }),
    useSearchParams: () => [new URLSearchParams(), jest.fn()]
  })
);

jest.mock("../../../src/pages/space/SpaceStudioPage.jsx", () => ({
  SpaceStudioPage: ({ initialRoom, clubhouse, onSave }) => <main aria-label="아지트 미리보기"
    data-template={initialRoom.template} data-room-name={initialRoom.name} data-input-blocked={clubhouse.inputBlocked}>
    <button onClick={() => onSave(initialRoom)}>편집기 테스트 저장</button>
  </main>
}));
jest.mock("../../../src/features/group-space/index.js", () => ({
  fetchGroupSpace: jest.fn(),
  useGroupSpace: jest.fn(),
  useSaveGroupSpace: jest.fn()
}));
jest.mock("../../../src/features/auth/index.js", () => ({ useAuth: jest.fn() }));
jest.mock("../../../src/features/activity-post/hooks.js", () => ({ useInfiniteActivityPosts: () => ({ data: { pages: [] } }) }));
jest.mock("../../../src/features/group/index.js", () => ({ useGroup: jest.fn() }));
jest.mock("../../../src/features/member/index.js", () => ({ useInfiniteGroupMembers: jest.fn() }));
jest.mock("../../../src/features/recruitment/index.js", () => ({
  useInfiniteRecruitments: jest.fn(),
  useRecruitment: jest.fn()
}));
jest.mock("../../../src/features/registration/index.js", () => ({
  useCreateRegistration: jest.fn(),
  useWithdrawRegistration: jest.fn()
}));

const leaderMemberId = 7;

const idleInfinite = {
  data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false
};

const baseGroup = {
  activeRecruitment: null,
  clubhouseSetupEnabled: true,
  createdAt: "2026-09-01T10:30:00",
  currentMemberRegistrationStatus: null,
  currentMemberRole: "LEADER",
  description: "함께 읽고 씁니다.",
  id: 41,
  introduction: "매주 한 편씩 읽어요",
  leader: { crewName: "써니", generation: 11, memberId: leaderMemberId },
  location: null,
  meetingType: "FLEXIBLE",
  memberCount: 1,
  name: "우아한 JDBC 탐구생활",
  recurringSchedule: null,
  representativeImageUrl: "/images/default-group.png",
  sessionSchedule: null,
  status: "ACTIVE",
  type: "STUDY"
};

function renderDetail({ group = baseGroup, memberId = leaderMemberId, state = null } = {}) {
  mockLocation = { pathname: "/groups/41", search: "", state };
  authHooks.useAuth.mockReturnValue({
    isAuthenticated: true,
    member: memberId === null ? null : { id: memberId }
  });
  groupHooks.useGroup.mockReturnValue({
    data: group,
    error: null,
    isError: false,
    isLoading: false,
    refetch: jest.fn()
  });
  return render(<GroupDetailPage />, { wrapper: ToastProvider });
}

const prompt = () => screen.queryByRole("dialog", { name: "모집을 시작할까요?" });
const setup = () => screen.queryByRole("dialog", { name: "어떤 아지트에서 모일까요?" });
const scene = () => screen.getByRole("main", { name: "아지트 미리보기", hidden: true });
const startWithDefault = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "기본 아지트로 시작하기" })));
const saveSpace = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  spaceHooks.fetchGroupSpace.mockReset();
  saveSpace.mockReset();
  saveSpace.mockImplementation(async ({ room }) => ({ room, revision: 1, canEdit: true, updatedAt: null }));
  spaceHooks.useGroupSpace.mockReturnValue({
    data: { canEdit: true, revision: 0, room: null, updatedAt: null },
    isFetchedAfterMount: true
  });
  spaceHooks.useSaveGroupSpace.mockReturnValue({ mutateAsync: saveSpace });
  memberHooks.useInfiniteGroupMembers.mockReturnValue(idleInfinite);
  recruitmentHooks.useInfiniteRecruitments.mockReturnValue(idleInfinite);
  recruitmentHooks.useRecruitment.mockReturnValue({ data: null, isError: false, isLoading: false });
  registrationHooks.useCreateRegistration.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn()
  });
  registrationHooks.useWithdrawRegistration.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn()
  });
});

it("방금 만든 모임에서 기본 아지트로 시작하면 기본 배치를 저장한 뒤 모집 안내를 연다", async () => {
  renderDetail({ state: { justCreated: true } });

  expect(setup()).toBeVisible();
  expect(scene()).toHaveAttribute("data-input-blocked", "true");
  expect(screen.getByRole("group", { name: "아지트 테마" }).querySelectorAll("button")).toHaveLength(7);
  expect(prompt()).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "이 아지트로 시작하기" })).toBeDisabled();
  expect(mockNavigate).not.toHaveBeenCalled();

  await startWithDefault();

  expect(saveSpace).toHaveBeenCalledWith({ expectedRevision: 0, room: expect.objectContaining({
    template: "lounge", version: 12, items: expect.arrayContaining([expect.objectContaining({ level: 1 })])
  }) });
  expect(setup()).not.toBeInTheDocument();
  expect(prompt()).toBeVisible();
  expect(screen.getByText("모집을 시작해야 다른 사람이 이 모임에 신청할 수 있어요.")).toBeVisible();
});

it.each(["다른 페이지로 이동", "닫기 버튼", "Escape", "바깥 영역 클릭"])(
  "%s 후 재방문하면 아지트 선택을 다시 보여주고, 기본 아지트 확정 후에는 보여주지 않는다",
  async (exit) => {
    const firstVisit = renderDetail();
    expect(setup()).toBeVisible();

    if (exit === "닫기 버튼") fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    if (exit === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    if (exit === "바깥 영역 클릭") fireEvent.mouseDown(setup().parentElement);
    if (exit !== "다른 페이지로 이동") expect(setup()).not.toBeInTheDocument();
    expect(prompt()).not.toBeInTheDocument();
    firstVisit.unmount();

    const returnVisit = renderDetail();
    expect(setup()).toBeVisible();
    await startWithDefault();
    expect(prompt()).toBeVisible();
    const [{ room }] = saveSpace.mock.calls[0];
    returnVisit.unmount();
    spaceHooks.useGroupSpace.mockReturnValue({
      data: { canEdit: true, revision: 1, room, updatedAt: null },
      isFetchedAfterMount: true
    });

    renderDetail();
    expect(setup()).not.toBeInTheDocument();
    expect(prompt()).not.toBeInTheDocument();
  }
);

it("모임원이 모임을 열면 미완료 상태여도 선택 화면을 표시하지 않는다", () => {
  renderDetail({ group: { ...baseGroup, currentMemberRole: "MEMBER" }, memberId: 99 });

  expect(setup()).not.toBeInTheDocument();
});

it("고른 아지트의 저장이 끝나면 상세 미리보기를 바꾸고 모집 안내를 연다", async () => {
  let finishSave;
  saveSpace.mockImplementation(({ room }) => new Promise((resolve) => {
    finishSave = () => resolve({ room, revision: 1, canEdit: true, updatedAt: "2026-11-12T10:00:00" });
  }));
  renderDetail();

  fireEvent.click(screen.getByRole("button", { name: "클라이밍" }));
  expect(screen.getByRole("button", { name: "클라이밍" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "이 아지트로 시작하기" }));
  expect(saveSpace).toHaveBeenCalledWith({
    expectedRevision: 0,
    room: expect.objectContaining({ name: baseGroup.name, template: "climbing" })
  });
  expect(prompt()).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "기본 아지트로 시작하기" })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(setup()).toBeVisible();

  await act(async () => finishSave());

  expect(setup()).not.toBeInTheDocument();
  expect(prompt()).toBeVisible();
  expect(screen.getByRole("main", { name: "아지트 미리보기" })).toHaveAttribute("data-template", "climbing");
});

it("저장이 실패하면 선택을 유지하고 재시도할 수 있다", async () => {
  saveSpace.mockRejectedValueOnce(new Error("오프라인"));
  renderDetail({ state: { justCreated: true } });

  fireEvent.click(screen.getByRole("button", { name: "밴드" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "이 아지트로 시작하기" })));

  expect(screen.getByRole("alert")).toHaveTextContent("아지트를 저장하지 못했어요");
  expect(screen.getByRole("button", { name: "밴드" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "이 아지트로 시작하기" })).toBeEnabled();
  expect(prompt()).not.toBeInTheDocument();

  await startWithDefault();
  expect(prompt()).toBeVisible();
});

it("이미 저장된 아지트가 있으면 초기 설정에서 다시 저장하지 않는다", () => {
  spaceHooks.useGroupSpace.mockReturnValue({
    data: { canEdit: true, revision: 1, room: createInitialRoom("photo"), updatedAt: null },
    isFetchedAfterMount: true
  });
  renderDetail({ state: { justCreated: true } });

  expect(setup()).not.toBeInTheDocument();
  expect(saveSpace).not.toHaveBeenCalled();
  expect(prompt()).not.toBeInTheDocument();
  expect(screen.getByRole("main", { name: "아지트 미리보기" })).toHaveAttribute("data-template", "photo");
  expect(scene()).toHaveAttribute("data-input-blocked", "false");
});

it("초기 저장이 충돌하면 이미 저장된 같은 테마의 공간과 revision을 불러온다", async () => {
  const room = { ...createInitialRoom(), name: "먼저 저장한 방" };
  saveSpace.mockRejectedValueOnce({ status: 409, code: "GROUP_SPACE_CONFLICT" });
  spaceHooks.fetchGroupSpace.mockResolvedValue({ room, revision: 4, canEdit: true, updatedAt: null });
  renderDetail({ state: { justCreated: true } });

  await startWithDefault();

  expect(spaceHooks.fetchGroupSpace).toHaveBeenCalledWith("41");
  expect(saveSpace).toHaveBeenCalledTimes(1);
  expect(setup()).not.toBeInTheDocument();
  expect(prompt()).not.toBeInTheDocument();
  expect(scene()).toHaveAttribute("data-room-name", room.name);
  expect(scene()).toHaveAttribute("data-input-blocked", "false");

  saveSpace.mockResolvedValueOnce({ room, revision: 5, canEdit: true, updatedAt: null });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "편집기 테스트 저장" })));
  expect(saveSpace).toHaveBeenLastCalledWith({ room, expectedRevision: 4 });
});

it("아지트 조회가 실패하면 선택과 모집 안내를 열지 않는다", () => {
  spaceHooks.useGroupSpace.mockReturnValue({ isError: true, error: new Error("오프라인") });
  renderDetail({ state: { justCreated: true } });

  expect(screen.getByText("공간을 불러오지 못했어요")).toBeVisible();
  expect(setup()).not.toBeInTheDocument();
  expect(prompt()).not.toBeInTheDocument();
  expect(saveSpace).not.toHaveBeenCalled();
});

it("Given 물음이 떠 있을 때, When 나중에 하기를 고르면, Then 상세에 그대로 머문다", async () => {
  renderDetail({ state: { justCreated: true } });
  await startWithDefault();

  fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));

  expect(prompt()).not.toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalledWith(
    "/groups/41/manage/recruitments",
    expect.anything()
  );
});

it("Given 물음이 떠 있을 때, When 모집 시작하기를 고르면, Then 모집 생성 화면으로 보낸다", async () => {
  renderDetail({ state: { justCreated: true } });
  await startWithDefault();

  fireEvent.click(screen.getByRole("button", { name: "모집 시작하기" }));

  expect(mockNavigate).toHaveBeenCalledWith("/groups/41/manage/recruitments", {
    state: { screen: "create" }
  });
});

it("기능 추가 전에 만든 모임은 배치가 없어도 선택 화면을 띄우지 않는다", () => {
  renderDetail({ group: { ...baseGroup, clubhouseSetupEnabled: false } });

  expect(setup()).not.toBeInTheDocument();
  expect(prompt()).not.toBeInTheDocument();
});

it("Given 이미 모집 중인 모임, When 방금 만든 진입이어도, Then 묻지 않는다", async () => {
  renderDetail({
    group: {
      ...baseGroup,
      activeRecruitment: {
        approvedCount: 0,
        capacity: 10,
        endsAt: null,
        id: 91,
        joinMethod: "AUTO",
        startsAt: "2026-09-01T10:00:00"
      }
    },
    state: { justCreated: true }
  });

  await startWithDefault();

  expect(prompt()).not.toBeInTheDocument();
});

it("Given 모임장이 아닌 사람, When 같은 표식을 들고 와도, Then 묻지 않는다", () => {
  renderDetail({ memberId: 99, state: { justCreated: true } });

  expect(setup()).not.toBeInTheDocument();

  expect(prompt()).not.toBeInTheDocument();
});

it("같이해요를 만들면 아지트 선택을 건너뛰고 모집을 안내한다", () => {
  jest.useFakeTimers();
  try {
    renderDetail({ group: { ...baseGroup, type: "SESSION" }, state: { justCreated: true } });
    expect(setup()).not.toBeInTheDocument();
    expect(prompt()).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith("/groups/41", { replace: true, state: null });

    act(() => jest.advanceTimersByTime(500));

    expect(prompt()).toBeVisible();
  } finally {
    jest.useRealTimers();
  }
});
