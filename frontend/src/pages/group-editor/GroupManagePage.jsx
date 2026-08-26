import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";

import {
  useDeleteGroup,
  useGroup,
  useModifyGroup,
  useRemoveRecurringSchedule,
  useReplaceRecurringSchedule,
  useReplaceSessionSchedule,
  useTerminateGroup
} from "../../features/group/index.js";
import scheduleIcon from "../../shared/assets/figma/edit-05.svg";
import placeIcon from "../../shared/assets/figma/edit-06.svg";
import memberIcon from "../../shared/assets/figma/edit-09.svg";
import kindIcon from "../../shared/assets/figma/edit-04.svg";
import { Button, ConfirmDialog, ErrorState, Modal, Skeleton, useToast } from "../../shared/ui/index.js";
import {
  DescriptionField,
  GroupContentTabs,
  MarkdownPreview,
  OverviewFields,
  RecurringScheduleFields,
  SessionScheduleFields
} from "./GroupEditorFields.jsx";
import { GroupMembersPanel } from "./GroupMembersPanel.jsx";
import { RepresentativeImage } from "./RepresentativeImage.jsx";
import { useSubmissionLock } from "./useSubmissionLock.js";
import { ManagementContext } from "../manage/ManagementContext.jsx";
import { meetingTypeLabel } from "../groups/pageUtils.js";
import "../manage/manage.css";

const overviewSchema = z.object({
  name: z.string().trim().min(1, "모임 이름을 입력해 주세요.").max(50),
  introduction: z.string().trim().min(1, "한 줄 소개를 입력해 주세요.").max(100),
  description: z.string().max(5000)
});

const recurringSchema = z
  .object({
    daysOfWeek: z.array(z.string()).min(1, "활동 요일을 하나 이상 선택해 주세요."),
    startTime: z.string().min(1, "시작 시간을 입력해 주세요."),
    endTime: z.string().min(1, "종료 시간을 입력해 주세요.")
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "종료 시간은 시작 시간보다 늦어야 해요.",
    path: ["endTime"]
  });

const sessionSchema = z
  .object({
    sessionDate: z.string().min(1, "진행 날짜를 입력해 주세요."),
    startTime: z.string().min(1, "시작 시간을 입력해 주세요."),
    endTime: z.string().min(1, "종료 시간을 입력해 주세요.")
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "종료 시간은 시작 시간보다 늦어야 해요.",
    path: ["endTime"]
  });

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_TYPE_LABEL = { CLUB: "동아리", SESSION: "세션", STUDY: "스터디" };
const RECURRING_DEFAULTS = { daysOfWeek: [], startTime: "19:00", endTime: "21:00" };
const SESSION_DEFAULTS = { sessionDate: "", startTime: "19:00", endTime: "21:00" };
const DAY_LABEL = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일"
};

function timeLabel(value) {
  return value?.slice(0, 5) ?? value;
}

function scheduleLabel(group) {
  if (group.sessionSchedule) {
    const schedule = group.sessionSchedule;
    return `${schedule.sessionDate} ${timeLabel(schedule.startTime)}–${timeLabel(schedule.endTime)}`;
  }
  if (group.recurringSchedule) {
    const schedule = group.recurringSchedule;
    const days = schedule.daysOfWeek.map((day) => DAY_LABEL[day] ?? day).join("·");
    return `매주 ${days} ${timeLabel(schedule.startTime)}–${timeLabel(schedule.endTime)}`;
  }
  if (group.type === "CLUB" || group.type === "STUDY") return "유동적";
  return "등록된 일정 없음";
}

function HeroFact({ icon, label, onClick, unavailable = false, value }) {
  const interactive = Boolean(onClick);
  const handleKeyDown = (event) => {
    if (!interactive || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div
      aria-label={interactive ? `${label} 수정` : undefined}
      className={
        [
          "group-editor__fact",
          unavailable && "group-editor__fact--unavailable",
          interactive && "group-editor__fact--interactive"
        ]
          .filter(Boolean)
          .join(" ")
      }
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <img alt="" aria-hidden="true" src={icon} />
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}

function errorDescription(error) {
  return error && typeof error === "object" && "userMessage" in error
    ? error.userMessage
    : "잠시 뒤 다시 시도해 주세요.";
}

function LifecyclePanel({
  canDelete,
  deleteMutation,
  formId,
  onDone,
  onError,
  savePending,
  terminateMutation
}) {
  const lock = useSubmissionLock();
  const isPending = deleteMutation.isPending || terminateMutation.isPending;
  const action = canDelete ? deleteMutation : terminateMutation;
  const verb = canDelete ? "삭제" : "종료";

  async function confirm() {
    await lock.run(async () => {
      try {
        await action.mutateAsync(canDelete ? undefined : { status: "ENDED" });
        onDone(verb);
      } catch (error) {
        onError(verb, error);
      }
    });
  }

  return (
    <section className="group-editor__lifecycle-actions" aria-label="모임 관리 액션">
      <div className="group-editor__danger-actions">
        <ConfirmDialog
          trigger={
            <Button type="button" variant="danger">
              모임 {verb}하기
            </Button>
          }
          title={`모임을 ${verb}할까요?`}
          description={
            canDelete
              ? (
                  <>
                    생성 후 24시간 안에는 모임을 완전히 삭제할 수 있어요.
                    <br />
                    되돌릴 수 없습니다.
                    <br />
                    정말 삭제하시겠습니까?
                  </>
                )
              : "이 작업은 되돌릴 수 없어요. 서버에서 마지막으로 가능 여부를 확인합니다."
          }
          confirmLabel={canDelete ? "삭제" : `${verb} 확인`}
          danger
          pending={isPending || lock.pending}
          onConfirm={confirm}
        />
        <Button form={formId} pending={savePending} size="sm" type="submit">
          변경 정보 저장하기
        </Button>
      </div>
    </section>
  );
}

export function GroupManagePage({ groupId: suppliedGroupId, now = new Date() }) {
  const params = useParams();
  const groupId = suppliedGroupId ?? params.groupId;
  const navigate = useNavigate();
  const toast = useToast();
  const groupQuery = useGroup(groupId);
  const modifyMutation = useModifyGroup(groupId);
  const deleteMutation = useDeleteGroup(groupId);
  const terminateMutation = useTerminateGroup(groupId);
  const recurringMutation = useReplaceRecurringSchedule(groupId);
  const removeRecurringMutation = useRemoveRecurringSchedule(groupId);
  const sessionMutation = useReplaceSessionSchedule(groupId);
  const overviewLock = useSubmissionLock();
  const scheduleLock = useSubmissionLock();
  const [preview, setPreview] = useState(false);
  const [contentTab, setContentTab] = useState("intro");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [recurringMode, setRecurringMode] = useState("regular");
  const overview = useForm({
    resolver: zodResolver(overviewSchema),
    defaultValues: { name: "", introduction: "", description: "" }
  });
  const recurring = useForm({
    resolver: zodResolver(recurringSchema),
    defaultValues: RECURRING_DEFAULTS
  });
  const session = useForm({
    resolver: zodResolver(sessionSchema),
    defaultValues: SESSION_DEFAULTS
  });
  const description = useWatch({ control: overview.control, name: "description" }) ?? "";
  const recurringDays = useWatch({ control: recurring.control, name: "daysOfWeek" }) ?? [];
  const resetOverview = overview.reset;
  const resetRecurring = recurring.reset;
  const resetSession = session.reset;

  useEffect(() => {
    const group = groupQuery.data;
    if (!group) return;
    resetOverview({
      name: group.name,
      introduction: group.introduction,
      description: group.description ?? ""
    });
    resetRecurring(group.recurringSchedule ?? RECURRING_DEFAULTS);
    resetSession(group.sessionSchedule ?? SESSION_DEFAULTS);
  }, [groupQuery.data, resetOverview, resetRecurring, resetSession]);

  if (groupQuery.isLoading)
    return (
      <div className="group-editor page-container">
        <Skeleton />
      </div>
    );
  if (groupQuery.error || !groupQuery.data) {
    return (
      <div className="group-editor page-container">
        <ErrorState
          title="모임 정보를 불러오지 못했어요."
          action={<Button onClick={() => groupQuery.refetch()}>다시 시도</Button>}
        />
      </div>
    );
  }

  const group = groupQuery.data;
  const age = now.getTime() - new Date(group.createdAt).getTime();
  const canDelete = age >= 0 && age <= DAY_MS;

  function openScheduleDialog() {
    setScheduleError("");
    if (group.type === "SESSION") {
      resetSession(group.sessionSchedule ?? SESSION_DEFAULTS);
    } else {
      resetRecurring(group.recurringSchedule ?? RECURRING_DEFAULTS);
      setRecurringMode(group.recurringSchedule ? "regular" : "flexible");
    }
    setScheduleDialogOpen(true);
  }

  function closeScheduleDialog() {
    if (scheduleLock.pending) return;
    setScheduleError("");
    if (group.type === "SESSION") {
      resetSession(group.sessionSchedule ?? SESSION_DEFAULTS);
    } else {
      resetRecurring(group.recurringSchedule ?? RECURRING_DEFAULTS);
      setRecurringMode(group.recurringSchedule ? "regular" : "flexible");
    }
    setScheduleDialogOpen(false);
  }

  function selectRecurringMode(mode) {
    setRecurringMode(mode);
    if (mode === "flexible") {
      resetRecurring(RECURRING_DEFAULTS);
      return;
    }
    resetRecurring(group.recurringSchedule ?? RECURRING_DEFAULTS);
  }

  function selectQuickDays(daysOfWeek) {
    recurring.setValue("daysOfWeek", daysOfWeek, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });
  }

  const saveOverview = overview.handleSubmit(async (values) => {
    await overviewLock.run(async () => {
      try {
        await modifyMutation.mutateAsync({
          ...values,
          meetingType: group.meetingType ?? "FLEXIBLE",
          location: group.location ?? null,
          name: values.name.trim(),
          introduction: values.introduction.trim()
        });
        toast.show({ title: "모임 정보를 저장했어요.", tone: "success" });
        navigate(`/groups/${groupId}`, { replace: true });
      } catch (error) {
        toast.show({
          title: "모임 정보를 저장하지 못했어요.",
          description: errorDescription(error),
          tone: "danger"
        });
      }
    });
  });
  const saveRecurringSchedule = recurring.handleSubmit(async (values) => {
    await scheduleLock.run(async () => {
      try {
        await recurringMutation.mutateAsync(values);
        setScheduleError("");
        setScheduleDialogOpen(false);
        toast.show({ title: "일정을 저장했어요.", tone: "success" });
      } catch (error) {
        setScheduleError(errorDescription(error));
      }
    });
  });

  async function saveFlexibleSchedule(event) {
    event.preventDefault();
    await scheduleLock.run(async () => {
      try {
        await removeRecurringMutation.mutateAsync();
        setScheduleError("");
        setScheduleDialogOpen(false);
        toast.show({ title: "일정을 유동적으로 설정했어요.", tone: "success" });
      } catch (error) {
        setScheduleError(errorDescription(error));
      }
    });
  }

  const saveSchedule =
    group.type === "SESSION"
      ? session.handleSubmit(async (values) => {
          await scheduleLock.run(async () => {
            try {
              await sessionMutation.mutateAsync(values);
              setScheduleError("");
              setScheduleDialogOpen(false);
              toast.show({ title: "일정을 저장했어요.", tone: "success" });
            } catch (error) {
              setScheduleError(errorDescription(error));
            }
          });
        })
      : recurringMode === "flexible"
        ? saveFlexibleSchedule
        : saveRecurringSchedule;

  return (
    <div className="manage-page manage-page--editor">
      <ManagementContext active="overview" groupId={groupId} />
      <div className="group-editor group-editor--embedded">
        <form
          className="group-editor__overview-form"
          id="group-overview-form"
          onSubmit={saveOverview}
          noValidate
        >
          <section className="group-editor__hero" aria-label="모임 기본 정보">
            <div className="group-editor__hero-fields">
              <div
                aria-disabled="true"
                className="group-editor__type-tag group-editor__type-tag--locked"
                title="생성된 모임의 종류는 변경할 수 없어요."
              >
                <img alt="" aria-hidden="true" src={kindIcon} />
                <span>{GROUP_TYPE_LABEL[group.type]}</span>
              </div>
              <h2 className="group-editor__visually-hidden">기본 정보 수정</h2>
              <OverviewFields
                className="group-editor__overview-fields--hero"
                errors={overview.formState.errors}
                register={overview.register}
                showDescription={false}
              />
              <dl className="group-editor__facts">
                <HeroFact icon={kindIcon} label="모임 방식" value={meetingTypeLabel(group.meetingType)} />
                <HeroFact
                  icon={scheduleIcon}
                  label="모임 일정"
                  onClick={openScheduleDialog}
                  value={scheduleLabel(group)}
                />
                <HeroFact icon={placeIcon} label="장소" value={group.location || "장소 미정"} />
                <HeroFact
                  icon={memberIcon}
                  label="현재 멤버 수"
                  value={Number.isInteger(group.memberCount) ? `${group.memberCount}명` : "확인 중"}
                />
              </dl>
            </div>
            <RepresentativeImage group={group} />
          </section>

          <GroupContentTabs onSelect={setContentTab} value={contentTab} />

          {contentTab === "intro" ? (
            <section
              className="group-editor__panel group-editor__description-panel"
              aria-label="모임 상세 소개"
            >
              <div className="group-editor__description-heading">
                <h2>모임 소개</h2>
                <div className="group-editor__description-tools">
                  <button
                    aria-pressed={!preview}
                    className={!preview ? "is-active" : ""}
                    onClick={() => setPreview(false)}
                    type="button"
                  >
                    작성
                  </button>
                  <button
                    aria-pressed={preview}
                    className={preview ? "is-active" : ""}
                    onClick={() => setPreview(true)}
                    type="button"
                  >
                    미리보기
                  </button>
                </div>
              </div>
              {preview ? (
                <MarkdownPreview value={description} />
              ) : (
                <DescriptionField
                  description=""
                  error={overview.formState.errors.description?.message}
                  label="모임 소개"
                  register={overview.register}
                  rows={7}
                />
              )}
              <div className="group-editor__editor-footer">
                <div className="group-editor__editor-help">
                  <span>Markdown 문법을 사용할 수 있어요.</span>
                  <span>{description.length.toLocaleString()} / 5,000자</span>
                </div>
              </div>
            </section>
          ) : (
            <section className="group-editor__panel group-editor__members-tab">
              <GroupMembersPanel groupId={groupId} />
            </section>
          )}
        </form>

        <Modal
          description="모임 유형에 맞는 일정 정보를 입력해 주세요."
          onClose={closeScheduleDialog}
          open={scheduleDialogOpen}
          title="활동 일정 수정"
        >
          <form className="group-editor__schedule-dialog" onSubmit={saveSchedule} noValidate>
            {scheduleError ? (
              <p className="group-editor__schedule-dialog-error" role="alert">
                {scheduleError}
              </p>
            ) : null}
            {group.type === "SESSION" ? (
              <SessionScheduleFields errors={session.formState.errors} register={session.register} />
            ) : (
              <RecurringScheduleFields
                errors={recurring.formState.errors}
                mode={recurringMode}
                onModeChange={selectRecurringMode}
                onQuickSelect={selectQuickDays}
                register={recurring.register}
                selectedDays={recurringDays}
                showModeSelector
                compact
              />
            )}
            <div className="group-editor__schedule-dialog-actions">
              <Button type="submit" pending={scheduleLock.pending}>
                일정 저장
              </Button>
            </div>
          </form>
        </Modal>

        {group.status === "ACTIVE" ? (
          <LifecyclePanel
            canDelete={canDelete}
            deleteMutation={deleteMutation}
            formId="group-overview-form"
            terminateMutation={terminateMutation}
            savePending={modifyMutation.isPending || overviewLock.pending}
            onDone={(verb) => {
              toast.show({ title: `모임을 ${verb}했어요.`, tone: "success" });
              navigate("/my?tab=joined", { replace: true });
            }}
            onError={(verb, error) => {
              toast.show({
                title: `모임을 ${verb}하지 못했어요.`,
                description: errorDescription(error),
                tone: "danger"
              });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
