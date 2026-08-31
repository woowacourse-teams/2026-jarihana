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
const mockUploadImage = jest.fn();

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

/*
 * 이미지 업로드 훅은 QueryClientProvider를 요구한다. 편집 화면 테스트는 프로바이더
 * 없이 페이지만 그리므로, 그룹 기능과 같은 방식으로 훅만 대역으로 바꾼다.
 */
jest.mock("../../../src/features/image-upload/index.js", () => ({
  ...jest.requireActual("../../../src/features/image-upload/api.js"),
  useImageUpload: () => ({ mutateAsync: mockUploadImage, error: null, isPending: false })
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
      GroupImage: ({ alt, className }) => <img alt={alt} className={className} src="/x.png" />,
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
      Tabs: ({ items, onValueChange, value }) => (
        <div>
          <div role="tablist">
            {items.map((item) => (
              <button
                aria-selected={item.value === value}
                key={item.value}
                onClick={() => onValueChange(item.value)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">{items.find((item) => item.value === value)?.content}</div>
        </div>
      ),
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

/* 저장 버튼은 폼 밖에 있고 form 속성으로 연결된다. */
const submitForm = (formId) => fireEvent.submit(document.getElementById(formId));

const openSchedule = async (user, name) =>
  user.click(screen.getByRole("button", { name }));

const scheduleDialog = () => screen.getByRole("dialog", { name: "활동 일정" });

describe("NewGroupPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateGroup.mockResolvedValue({ id: 73, status: "ACTIVE" });
  });

  it("submits the exact SESSION create body when the session form is valid", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await user.selectOptions(screen.getByLabelText("모임 종류"), "SESSION");
    await user.type(screen.getByLabelText("모임 이름"), "성능 튜닝 세션");
    await user.type(screen.getByLabelText("한 줄 소개"), "한 번에 깊게 파고들어요");
    await user.type(
      screen.getByRole("textbox", { name: /^모임 소개/ }),
      "실전 예제로 함께 학습합니다."
    );

    // When
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();
    fireEvent.change(within(dialog).getByLabelText("진행 날짜"), {
      target: { value: "2026-09-12" }
    });
    await user.click(within(dialog).getByRole("button", { name: "일정 저장" }));
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
        representativeImageKey: null,
        recurringSchedule: null,
        sessionSchedule: {
          sessionDate: "2026-09-12",
          startTime: "19:00",
          endTime: "21:00"
        }
      })
    );
  });

  it("제출이 막히면 그 이유를 화면에 남긴다", async () => {
    // Given 필수값을 비운 채로
    renderPage(<NewGroupPage />);

    // When
    submitForm("group-create-form");

    // Then 등록은 막히되 이유가 보여야 한다.
    // not.toHaveBeenCalled()는 이미 참이라 waitFor가 즉시 통과한다. 오류 자체를 기다린다.
    await waitFor(() =>
      expect(screen.getByText("모임 이름을 입력해 주세요.")).toBeVisible()
    );
    expect(screen.getByText("한 줄 소개를 입력해 주세요.")).toBeVisible();
    expect(mockCreateGroup).not.toHaveBeenCalled();
  });

  it("요일 없이 만들면 유동적 일정으로 등록된다", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await user.type(screen.getByLabelText("모임 이름"), "리액트 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "매주 함께 공부해요");

    // When
    submitForm("group-create-form");

    // Then
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    expect(mockCreateGroup.mock.calls[0][0]).toMatchObject({
      type: "STUDY",
      recurringSchedule: null,
      sessionSchedule: null
    });
  });

  it("유동적일 때는 요일도 두지 않는다", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();
    await user.click(within(dialog).getByRole("button", { name: "평일" }));
    expect(within(dialog).getByLabelText("월요일")).toBeInTheDocument();

    // When
    await user.click(within(dialog).getByRole("button", { name: "유동적" }));

    // Then 쓰이지 않는 값이므로 요일도 함께 감춘다.
    expect(within(dialog).queryByLabelText("월요일")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("활동 요일")).not.toBeInTheDocument();
  });

  it("유동적일 때는 시간 입력을 두지 않는다", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();

    // Then 요일이 없으면 시간은 쓰이지 않으므로 보이지 않는다.
    expect(within(dialog).queryByLabelText("시작 시간")).not.toBeInTheDocument();

    // When 요일을 고르면 시간이 필요해진다.
    await user.click(within(dialog).getByRole("button", { name: "평일" }));

    // Then
    expect(within(dialog).getByLabelText("시작 시간")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("종료 시간")).toBeInTheDocument();
  });

  it("시간을 뒤집어 둔 뒤 유동적으로 바꿔도 등록이 막히지 않는다", async () => {
    // Given 종료가 시작보다 이른 상태를 만들고
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await user.type(screen.getByLabelText("모임 이름"), "유동적 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "요일 없이 모여요");
    await openSchedule(user, "모임 일정 설정");
    let dialog = scheduleDialog();
    await user.click(within(dialog).getByRole("button", { name: "평일" }));
    fireEvent.change(within(dialog).getByLabelText("종료 시간"), { target: { value: "18:00" } });

    // When 유동적으로 바꾼다. 시간은 더 이상 쓰이지 않는다.
    await user.click(within(dialog).getByRole("button", { name: "유동적" }));
    await user.click(within(dialog).getByRole("button", { name: "일정 저장" }));
    submitForm("group-create-form");

    // Then 숨은 시간 오류가 제출을 막지 않는다.
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    expect(mockCreateGroup.mock.calls[0][0]).toMatchObject({ recurringSchedule: null });
  });

  it("생성 화면에서도 유동적을 고를 수 있다", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await user.type(screen.getByLabelText("모임 이름"), "유동적 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "요일 없이 모여요");

    // When
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();
    await user.click(within(dialog).getByRole("button", { name: "매일" }));
    await user.click(within(dialog).getByRole("button", { name: "유동적" }));
    await user.click(within(dialog).getByRole("button", { name: "일정 저장" }));
    submitForm("group-create-form");

    // Then
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    expect(mockCreateGroup.mock.calls[0][0]).toMatchObject({ recurringSchedule: null });
  });

  it("edits the schedule in a dialog rather than in the hero", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);

    // Then 히어로에는 요일이 없다.
    expect(screen.queryByRole("dialog", { name: "활동 일정" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("월요일")).not.toBeInTheDocument();

    // When
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();

    // Then 유동적으로 시작하므로 요일도 아직 없다.
    expect(within(dialog).queryByLabelText("월요일")).not.toBeInTheDocument();

    // When 프리셋을 고르면 요일이 나타난다.
    await user.click(within(dialog).getByRole("button", { name: "평일" }));

    // Then
    expect(within(dialog).getByLabelText("월요일")).toBeInTheDocument();
  });

  it("applies a preset from the four-column toggle and leaves other days usable", async () => {
    // Given
    const user = userEvent.setup();
    renderPage(<NewGroupPage />);
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();

    // When
    await user.click(within(dialog).getByRole("button", { name: "평일" }));

    // Then
    expect(within(dialog).getByRole("button", { name: "평일" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(dialog).getByLabelText("월요일")).toBeChecked();
    expect(within(dialog).getByLabelText("토요일")).not.toBeChecked();
    // 잠그지 않으므로 평일 + 토요일 조합에 계속 도달할 수 있다.
    expect(within(dialog).getByLabelText("토요일")).toBeEnabled();

    // When
    await user.click(within(dialog).getByLabelText("토요일"));

    // Then
    expect(within(dialog).getByLabelText("토요일")).toBeChecked();
    expect(within(dialog).getByLabelText("월요일")).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "평일" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
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
    await openSchedule(user, "모임 일정 설정");
    const dialog = scheduleDialog();
    // 유동적 상태에서는 요일이 없으므로 프리셋으로 정기 일정을 연 뒤 조정한다.
    await user.click(within(dialog).getByRole("button", { name: "매일" }));
    for (const day of ["월요일", "화요일", "목요일", "금요일", "토요일", "일요일"]) {
      await user.click(within(dialog).getByLabelText(day));
    }
    await user.click(within(dialog).getByRole("button", { name: "일정 저장" }));
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

  it("shows the member count as text rather than an editable field", () => {
    // Given
    renderPage(<NewGroupPage />);

    // Then
    expect(screen.getByText("개설자 1명")).toBeVisible();
    expect(screen.queryByLabelText("현재 멤버 수")).not.toBeInTheDocument();
  });

  it("never exposes a fake upload control", () => {
    // Given
    renderPage(<NewGroupPage />);

    // Then
    expect(screen.queryByLabelText(/이미지 업로드/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /대표 이미지 변경/ })).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText("모임 이름"), "중복 방지 스터디");
    await user.type(screen.getByLabelText("한 줄 소개"), "한 번만 생성돼요");

    // When
    submitForm("group-create-form");
    submitForm("group-create-form");

    // Then
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1));
    await act(async () => finishRequest({ id: 73, status: "ACTIVE" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/groups/73"));
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

  it("keeps the group type as plain text because it cannot change", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // When
    const hero = screen.getByRole("region", { name: "모임 기본 정보" });

    // Then
    expect(within(hero).getByText("스터디")).toBeVisible();
    expect(within(hero).queryByLabelText("모임 종류")).not.toBeInTheDocument();
  });

  it("shows the member count as text rather than an editable field", () => {
    // Given
    renderPage(<GroupManagePage groupId="17" now={new Date("2026-08-21T11:00:00")} />);

    // Then
    expect(screen.getByText("6명")).toBeVisible();
    expect(screen.queryByLabelText("현재 멤버 수")).not.toBeInTheDocument();
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
        location: null,
        representativeImageKey: null
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
    await openSchedule(user, "모임 일정 수정");
    const dialog = scheduleDialog();
    await user.click(within(dialog).getByLabelText("수요일"));
    await user.click(within(dialog).getByRole("button", { name: "일정 저장" }));
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
    await openSchedule(user, "모임 일정 수정");
    const dialog = scheduleDialog();
    await user.click(within(dialog).getByRole("button", { name: "유동적" }));
    await user.click(within(dialog).getByRole("button", { name: "일정 저장" }));
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
