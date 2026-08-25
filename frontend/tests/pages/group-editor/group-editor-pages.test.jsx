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
      Button: ({ children, pending, variant: _variant, ...props }) => (
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
      MarkdownContent: ({ value, emptyText }) => <div>{value || emptyText}</div>,
      Modal: ({ children, description, open, title }) =>
        open ? (
          <div role="dialog" aria-label={title}>
            <p>{description}</p>
            {children}
          </div>
        ) : null,
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

/* The save button sits outside the form and is wired with the form attribute. */
const submitForm = (formId) =>
  fireEvent.submit(document.getElementById(formId));

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
    await user.click(screen.getByLabelText("세션"));
    await user.type(screen.getByLabelText("모임 이름"), "성능 튜닝 세션");
    await user.type(screen.getByLabelText("한 줄 소개"), "한 번에 깊게 파고들어요");
    await user.type(
      screen.getByRole("textbox", { name: /^모임 소개/ }),
      "실전 예제로 함께 학습합니다."
    );
    fireEvent.change(screen.getByLabelText("진행 날짜"), { target: { value: "2026-09-12" } });
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "19:00" } });
    fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "21:00" } });
    submitForm("group-create-form");

    // Then
    await waitFor(() =>
      expect(mockCreateGroup).toHaveBeenCalledWith({
        type: "SESSION",
        name: "성능 튜닝 세션",
        introduction: "한 번에 깊게 파고들어요",
        description: "실전 예제로 함께 학습합니다.",
        meetingType: "FLEXIBLE",
        location: null,
        recurringSchedule: null,
        sessionSchedule: {
          sessionDate: "2026-09-12",
          startTime: "19:00",
          endTime: "21:00"
        }
      })
    );
  });

  it("creates a flexible group when no activity day is chosen", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);

    // When
    await user.type(screen.getByLabelText("모임 이름"), "리액트 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "매주 함께 공부해요");
    submitForm("group-create-form");

    // Then
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    expect(mockCreateGroup.mock.calls[0][0]).toMatchObject({
      type: "STUDY",
      recurringSchedule: null,
      sessionSchedule: null
    });
  });

  it("fills every weekday from the 평일 preset and clears it on a second press", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    const weekday = screen.getByRole("button", { name: "평일" });

    // When
    await user.click(weekday);

    // Then
    expect(weekday).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("월요일")).toBeChecked();
    expect(screen.getByLabelText("금요일")).toBeChecked();
    expect(screen.getByLabelText("토요일")).not.toBeChecked();

    // When
    await user.click(weekday);

    // Then
    expect(weekday).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("월요일")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "유동적" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends the meeting type and location chosen in the hero", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);

    // When
    await user.type(screen.getByLabelText("모임 이름"), "오프라인 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "만나서 공부해요");
    await user.selectOptions(screen.getByLabelText("모임 방식"), "OFFLINE");
    await user.type(screen.getByLabelText("장소"), "선릉 캠퍼스 3층");
    await user.click(screen.getByLabelText("수요일"));
    submitForm("group-create-form");

    // Then
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    expect(mockCreateGroup.mock.calls[0][0]).toMatchObject({
      meetingType: "OFFLINE",
      location: "선릉 캠퍼스 3층",
      recurringSchedule: {
        daysOfWeek: ["WEDNESDAY"],
        startTime: "19:00",
        endTime: "21:00"
      }
    });
  });

  it("gives the group type control a visible label", () => {
    // Given
    renderPage(<NewGroupPage />);

    // Then
    expect(screen.getByRole("radiogroup", { name: "모임 종류" })).toBeInTheDocument();
    expect(screen.getByText("모임 종류")).toBeVisible();
  });

  it("drops the description counter when the members tab is open", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    expect(screen.getByText(/\/ 5,000/)).toBeInTheDocument();

    // When
    await user.click(screen.getByRole("tab", { name: "멤버" }));

    // Then
    expect(screen.queryByText(/\/ 5,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/5,000자/)).not.toBeInTheDocument();
  });

  it("never exposes a fake upload control", () => {
    // Given
    renderPage(<NewGroupPage />);

    // Then
    expect(screen.queryByLabelText(/이미지 업로드/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /대표 이미지 변경/ })).toBeInTheDocument();
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
    await user.click(screen.getByLabelText("세션"));
    await user.type(screen.getByLabelText("모임 이름"), "중복 방지 세션");
    await user.type(screen.getByLabelText("한 줄 소개"), "한 번만 생성돼요");
    fireEvent.change(screen.getByLabelText("진행 날짜"), { target: { value: "2026-09-12" } });

    // When
    submitForm("group-create-form");
    submitForm("group-create-form");

    // Then
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    await act(async () => finishRequest({ id: 73, status: "ACTIVE" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/groups/73/manage"));
  });
});

describe("MarkdownEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateGroup.mockResolvedValue({ id: 73, status: "ACTIVE" });
  });

  it("wraps the selected text instead of appending to the end", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    const editor = screen.getByRole("textbox", { name: /^모임 소개/ });
    await user.type(editor, "굵게 만들 부분 그리고 꼬리말");

    // When
    editor.setSelectionRange(0, 8);
    await user.click(screen.getByRole("button", { name: "굵게" }));

    // Then
    expect(editor).toHaveValue("**굵게 만들 부분** 그리고 꼬리말");
  });

  it("keeps whitespace outside the markers so the emphasis still parses", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    const editor = screen.getByRole("textbox", { name: /^모임 소개/ });
    await user.type(editor, "굵게 만들 부분 그리고 꼬리말");

    // When the selection accidentally catches the trailing space
    editor.setSelectionRange(0, 9);
    await user.click(screen.getByRole("button", { name: "굵게" }));

    // Then
    expect(editor).toHaveValue("**굵게 만들 부분** 그리고 꼬리말");
  });

  it("inserts a code fence and keeps the placeholder selected", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    const editor = screen.getByRole("textbox", { name: /^모임 소개/ });

    // When
    await user.click(screen.getByRole("button", { name: "코드 블럭" }));

    // Then
    expect(editor.value).toContain("```");
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "코드를 붙여 넣어요"
    );
  });

  it("disables the toolbar while previewing rather than forcing the editor back", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);

    // When
    await user.click(screen.getByRole("button", { name: "미리보기" }));

    // Then
    expect(screen.getByRole("button", { name: "굵게" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: /^모임 소개/ })).not.toBeInTheDocument();
  });
});

describe("GroupManagePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupFixture = {
      id: 17,
      type: "STUDY",
      meetingType: "FLEXIBLE",
      location: null,
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
    mockRemoveRecurringSchedule.mockResolvedValue(undefined);
  });

  it("labels the primary action as an edit rather than a create", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // Then
    expect(screen.getByRole("button", { name: "모임 수정하기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 만들기" })).not.toBeInTheDocument();
  });

  it("keeps the group type locked while editing", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const overviewHero = screen.getByRole("region", { name: "모임 기본 정보" });
    const typeTag = within(overviewHero).getByText("스터디").closest(".group-editor__type-tag");

    // Then
    expect(typeTag).toHaveAttribute("aria-disabled", "true");
    expect(
      within(overviewHero).queryByRole("radiogroup", { name: "모임 종류" })
    ).not.toBeInTheDocument();
  });

  it("saves the overview without a schedule request when the schedule is untouched", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const name = screen.getByLabelText("모임 이름");
    await user.clear(name);
    await user.type(name, "우아한 SQL 탐구생활");
    submitForm("group-overview-form");

    // Then
    await waitFor(() =>
      expect(mockModifyGroup).toHaveBeenCalledWith({
        name: "우아한 SQL 탐구생활",
        introduction: "더 좋은 설계를 고민해요.",
        description: "JDBC 내부 동작을 함께 탐구합니다.",
        meetingType: "FLEXIBLE",
        location: null
      })
    );
    expect(mockReplaceRecurringSchedule).not.toHaveBeenCalled();
    expect(mockRemoveRecurringSchedule).not.toHaveBeenCalled();
  });

  it("saves the overview and the changed schedule from one submission", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    await user.click(screen.getByLabelText("수요일"));
    submitForm("group-overview-form");

    // Then
    await waitFor(() =>
      expect(mockReplaceRecurringSchedule).toHaveBeenCalledWith({
        daysOfWeek: ["MONDAY", "WEDNESDAY"],
        startTime: "19:00",
        endTime: "21:00"
      })
    );
    expect(mockModifyGroup).toHaveBeenCalledTimes(1);
  });

  it("turns the group flexible when every day is cleared", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    await user.click(screen.getByRole("button", { name: "유동적" }));
    submitForm("group-overview-form");

    // Then
    await waitFor(() => expect(mockRemoveRecurringSchedule).toHaveBeenCalled());
    expect(mockReplaceRecurringSchedule).not.toHaveBeenCalled();
  });

  it("edits the meeting type and location alongside the overview", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    await user.selectOptions(screen.getByLabelText("모임 방식"), "ONLINE");
    await user.type(screen.getByLabelText("장소"), "https://meet.example.com/jdbc");
    submitForm("group-overview-form");

    // Then
    await waitFor(() => expect(mockModifyGroup).toHaveBeenCalledTimes(1));
    expect(mockModifyGroup.mock.calls[0][0]).toMatchObject({
      meetingType: "ONLINE",
      location: "https://meet.example.com/jdbc"
    });
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

  it("deletes within the 24-hour window", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:59:59")} />);

    // When
    const dangerZone = screen.getByRole("region", { name: "모임 삭제 설정" });
    await user.click(within(dangerZone).getByRole("button", { name: "모임 삭제하기" }));

    // Then
    await waitFor(() => expect(mockDeleteGroup).toHaveBeenCalledWith(undefined));
    expect(mockTerminateGroup).not.toHaveBeenCalled();
  });

  it("surfaces a safe mutation failure without navigating away", async () => {
    // Given
    mockModifyGroup.mockRejectedValue({ userMessage: "같은 이름의 모임이 이미 있어요." });
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    submitForm("group-overview-form");

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

  it("uses the route-backed leader management tabs", () => {
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
