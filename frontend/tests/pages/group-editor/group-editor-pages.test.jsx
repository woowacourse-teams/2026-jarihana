import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateGroup = jest.fn();
const mockModifyGroup = jest.fn();
const mockDeleteGroup = jest.fn();
const mockTerminateGroup = jest.fn();
const mockReplaceRecurringSchedule = jest.fn();
const mockRemoveRecurringSchedule = jest.fn();
const mockReplaceSessionSchedule = jest.fn();
const mockShowToast = jest.fn();
const mockNavigate = jest.fn();

let mockGroupFixture;

jest.mock("../../../src/features/group/index.js", () => ({
  useCreateGroup: () => ({ mutateAsync: mockCreateGroup, isPending: false }),
  useDeleteGroup: () => ({ mutateAsync: mockDeleteGroup, isPending: false }),
  useGroup: () => ({ data: mockGroupFixture, error: null, isLoading: false, refetch: jest.fn() }),
  useModifyGroup: () => ({ mutateAsync: mockModifyGroup, isPending: false }),
  useRemoveRecurringSchedule: () => ({
    mutateAsync: mockRemoveRecurringSchedule,
    isPending: false
  }),
  useReplaceRecurringSchedule: () => ({
    mutateAsync: mockReplaceRecurringSchedule,
    isPending: false
  }),
  useReplaceSessionSchedule: () => ({ mutateAsync: mockReplaceSessionSchedule, isPending: false }),
  useTerminateGroup: () => ({ mutateAsync: mockTerminateGroup, isPending: false })
}));

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a {...properties} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => ({ groupId: "17" })
}));

jest.mock(
  "../../../src/shared/ui/index.js",
  () => {
    const React = require("react");

    const Field = React.forwardRef(function Field(
      { label, error, description, as: Tag = "input", children, ...props },
      ref
    ) {
      return (
        <label>
          <span>{label}</span>
          {description ? <span>{description}</span> : null}
          <Tag ref={ref} {...props}>
            {children}
          </Tag>
          {error ? <span role="alert">{error}</span> : null}
        </label>
      );
    });

    return {
      Button: ({ children, pending, ...props }) => (
        <button disabled={pending} {...props}>
          {children}
        </button>
      ),
      Checkbox: React.forwardRef(function Checkbox({ label, error, ...props }, ref) {
        return (
          <label>
            <input type="checkbox" ref={ref} {...props} />
            {label}
            {error ? <span role="alert">{error}</span> : null}
          </label>
        );
      }),
      ConfirmDialog: ({ trigger, title, onConfirm, pending }) => (
        <div>
          {React.cloneElement(trigger, { disabled: pending, onClick: onConfirm })}
          <span>{title}</span>
        </div>
      ),
      ErrorState: ({ title }) => <div role="alert">{title}</div>,
      Select: React.forwardRef(function Select(props, ref) {
        return <Field ref={ref} as="select" {...props} />;
      }),
      Skeleton: () => <div aria-label="불러오는 중" />,
      Textarea: React.forwardRef(function Textarea(props, ref) {
        return <Field ref={ref} as="textarea" {...props} />;
      }),
      TextField: React.forwardRef(function TextField(props, ref) {
        return <Field ref={ref} {...props} />;
      }),
      useToast: () => ({ show: mockShowToast })
    };
  },
  { virtual: true }
);

import { GroupManagePage, NewGroupPage } from "../../../src/pages/group-editor/index.jsx";

const renderPage = (node) => render(node);

describe("NewGroupPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateGroup.mockResolvedValue({ id: 73, status: "ACTIVE" });
  });

  it("submits the exact SESSION create body when the session form is valid", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);

    // When
    await user.selectOptions(screen.getByLabelText("모임 종류"), "SESSION");
    await user.type(screen.getByLabelText("모임 이름"), "성능 튜닝 세션");
    await user.type(screen.getByLabelText("한 줄 소개"), "한 번에 깊게 파고들어요");
    await user.type(
      screen.getByRole("textbox", { name: /^모임 소개/ }),
      "실전 예제로 함께 학습합니다."
    );
    fireEvent.change(screen.getByLabelText("진행 날짜"), { target: { value: "2026-09-12" } });
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "19:00" } });
    fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "21:00" } });
    await user.click(screen.getByRole("button", { name: "모임 만들기" }));

    // Then
    await waitFor(() =>
      expect(mockCreateGroup).toHaveBeenCalledWith({
        type: "SESSION",
        name: "성능 튜닝 세션",
        introduction: "한 번에 깊게 파고들어요",
        description: "실전 예제로 함께 학습합니다.",
        recurringSchedule: null,
        sessionSchedule: {
          sessionDate: "2026-09-12",
          startTime: "19:00",
          endTime: "21:00"
        }
      })
    );
  });

  it("requires an activity day for recurring groups and never exposes a fake upload", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);

    // When
    await user.type(screen.getByLabelText("모임 이름"), "리액트 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "매주 함께 공부해요");
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "19:00" } });
    fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "21:00" } });
    await user.click(screen.getByRole("button", { name: "모임 만들기" }));

    // Then
    expect(await screen.findByRole("alert", { name: "" })).toHaveTextContent(
      "활동 요일을 하나 이상 선택해 주세요."
    );
    expect(mockCreateGroup).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/이미지 업로드/)).not.toBeInTheDocument();
    expect(screen.getByText(/생성 시 서버 기본 이미지가 적용돼요/)).toBeInTheDocument();
  });

  it("locks a valid create form after the first submission", async () => {
    // Given
    const user = userEvent.setup();
    let finishRequest;
    mockCreateGroup.mockReturnValue(
      new Promise((resolve) => {
        finishRequest = resolve;
      })
    );
    renderPage(<NewGroupPage />);
    await user.selectOptions(screen.getByLabelText("모임 종류"), "SESSION");
    await user.type(screen.getByLabelText("모임 이름"), "중복 방지 세션");
    await user.type(screen.getByLabelText("한 줄 소개"), "한 번만 생성돼요");
    fireEvent.change(screen.getByLabelText("진행 날짜"), { target: { value: "2026-09-12" } });

    // When
    const submit = screen.getByRole("button", { name: "모임 만들기" });
    await user.click(submit);
    await user.click(submit);

    // Then
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    await act(async () => finishRequest({ id: 73, status: "ACTIVE" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/groups/73/manage"));
  });
});

describe("GroupManagePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupFixture = {
      id: 17,
      type: "STUDY",
      status: "ACTIVE",
      name: "우아한 JDBC 탐구생활",
      introduction: "더 좋은 설계를 고민해요.",
      description: "JDBC 내부 동작을 함께 탐구합니다.",
      representativeImageUrl: "/images/default-group.png",
      recurringSchedule: { daysOfWeek: ["MONDAY"], startTime: "19:00", endTime: "21:00" },
      sessionSchedule: null,
      leader: { memberId: 2, crewName: "리더", generation: 3 },
      memberCount: 6,
      activeRecruitment: null,
      createdAt: "2026-08-20T12:00:00"
    };
    mockModifyGroup.mockResolvedValue(mockGroupFixture);
    mockDeleteGroup.mockResolvedValue(undefined);
    mockTerminateGroup.mockResolvedValue({ id: 17, status: "ENDED" });
    mockReplaceRecurringSchedule.mockResolvedValue(mockGroupFixture.recurringSchedule);
  });

  it("edits only the backend-supported overview fields", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const name = screen.getByLabelText("모임 이름");
    await user.clear(name);
    await user.type(name, "우아한 SQL 탐구생활");
    await user.click(screen.getByRole("button", { name: "기본 정보 저장" }));

    // Then
    await waitFor(() =>
      expect(mockModifyGroup).toHaveBeenCalledWith({
        name: "우아한 SQL 탐구생활",
        introduction: "더 좋은 설계를 고민해요.",
        description: "JDBC 내부 동작을 함께 탐구합니다."
      })
    );
    expect(
      screen.getByText("대표 이미지는 서버에서 제공하는 이미지를 사용해요.")
    ).toBeInTheDocument();
  });

  it("separates the compact overview hero from the long description editor", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const overviewHero = screen.getByRole("region", { name: "모임 기본 정보" });
    const descriptionPanel = screen.getByRole("region", { name: "모임 상세 소개" });

    // Then
    expect(
      within(overviewHero).queryByRole("textbox", { name: /^모임 소개/ })
    ).not.toBeInTheDocument();
    expect(
      within(descriptionPanel).getByRole("textbox", { name: /^모임 소개/ })
    ).toBeInTheDocument();
    expect(within(overviewHero).getByText("스터디")).toBeInTheDocument();
    expect(
      within(overviewHero).queryByRole("combobox", { name: "모임 종류" })
    ).not.toBeInTheDocument();
  });

  it("uses the in-place edit hierarchy without numbered cards or an upload action", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const overviewHero = screen.getByRole("region", { name: "모임 기본 정보" });
    const representativeImage = within(overviewHero).getByLabelText("읽기 전용 대표 이미지");
    const descriptionPanel = screen.getByRole("region", { name: "모임 상세 소개" });

    // Then
    expect(screen.queryByText(/^(01|02|03)$/)).not.toBeInTheDocument();
    expect(within(representativeImage).queryByRole("button")).not.toBeInTheDocument();
    expect(within(descriptionPanel).getByRole("textbox", { name: /^모임 소개/ })).toHaveAttribute(
      "rows",
      "7"
    );
  });

  it("uses termination after the 24-hour deletion window", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T12:00:01")} />);

    // When
    const dangerZone = screen.getByRole("region", { name: "모임 종료 설정" });
    await user.click(within(dangerZone).getByRole("button", { name: "모임 종료하기" }));

    // Then
    await waitFor(() => expect(mockTerminateGroup).toHaveBeenCalledWith({ status: "ENDED" }));
    expect(mockDeleteGroup).not.toHaveBeenCalled();
  });

  it("deletes within 24 hours and replaces a recurring schedule exactly", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:59:59")} />);

    // When
    await user.click(screen.getByLabelText("수요일"));
    await user.click(screen.getByRole("button", { name: "일정 저장" }));
    const dangerZone = screen.getByRole("region", { name: "모임 삭제 설정" });
    await user.click(within(dangerZone).getByRole("button", { name: "모임 삭제하기" }));

    // Then
    await waitFor(() =>
      expect(mockReplaceRecurringSchedule).toHaveBeenCalledWith({
        daysOfWeek: ["MONDAY", "WEDNESDAY"],
        startTime: "19:00",
        endTime: "21:00"
      })
    );
    await waitFor(() => expect(mockDeleteGroup).toHaveBeenCalledWith(undefined));
    expect(mockTerminateGroup).not.toHaveBeenCalled();
  });

  it("surfaces a safe mutation failure without navigating away", async () => {
    // Given
    const user = userEvent.setup();
    mockModifyGroup.mockRejectedValue({ userMessage: "같은 이름의 모임이 이미 있어요." });
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    await user.click(screen.getByRole("button", { name: "기본 정보 저장" }));

    // Then
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        title: "모임 정보를 저장하지 못했어요.",
        description: "같은 이름의 모임이 이미 있어요.",
        tone: "danger"
      })
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("uses the route-backed leader management tabs from the Figma draft", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const navigation = screen.getByRole("navigation", { name: "모임 관리 메뉴" });

    // Then
    expect(within(navigation).getByRole("link", { name: "모임 수정" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(navigation).getByRole("link", { name: "모집 관리" })).toHaveAttribute(
      "href",
      "/groups/17/manage/recruitments"
    );
  });
});
