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
import { Button, ConfirmDialog, ErrorState, Skeleton, useToast } from "../../shared/ui/index.js";
import {
  GroupContentTabs,
  GroupTypeField,
  MeetingFields,
  OverviewFields,
  ReadOnlyFact,
  RecurringScheduleFields,
  SessionScheduleFields
} from "./GroupEditorFields.jsx";
import { GroupMembersPanel } from "./GroupMembersPanel.jsx";
import { MarkdownEditor } from "./MarkdownEditor.jsx";
import { RepresentativeImage } from "./RepresentativeImage.jsx";
import { useSubmissionLock } from "./useSubmissionLock.js";
import { ManagementContext } from "../manage/ManagementContext.jsx";
import "../manage/manage.css";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "시간을 입력해 주세요.");

const manageSchema = z
  .object({
    name: z.string().trim().min(1, "모임 이름을 입력해 주세요.").max(50),
    introduction: z.string().trim().min(1, "한 줄 소개를 입력해 주세요.").max(100),
    description: z.string().max(5000, "5,000자 이하로 입력해 주세요."),
    meetingType: z.enum(["ONLINE", "OFFLINE", "FLEXIBLE"]),
    location: z.string().max(255, "255자 이하로 입력해 주세요."),
    isSession: z.boolean(),
    daysOfWeek: z.array(
      z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])
    ),
    sessionDate: z.string(),
    startTime: timeSchema,
    endTime: timeSchema
  })
  .superRefine((values, context) => {
    if (values.endTime <= values.startTime) {
      context.addIssue({
        code: "custom",
        message: "종료 시간은 시작 시간보다 늦어야 해요.",
        path: ["endTime"]
      });
    }
    if (values.isSession && !/^\d{4}-\d{2}-\d{2}$/.test(values.sessionDate)) {
      context.addIssue({
        code: "custom",
        message: "진행 날짜를 입력해 주세요.",
        path: ["sessionDate"]
      });
    }
  });

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_TYPE_LABEL = { CLUB: "동아리", SESSION: "세션", STUDY: "스터디" };
const DEFAULT_TIMES = { endTime: "21:00", startTime: "19:00" };

function timeValue(value) {
  return value ? value.slice(0, 5) : "";
}

function toFormValues(group) {
  const recurring = group.recurringSchedule;
  const session = group.sessionSchedule;
  const schedule = session ?? recurring;
  return {
    name: group.name,
    introduction: group.introduction,
    description: group.description ?? "",
    meetingType: group.meetingType ?? "FLEXIBLE",
    location: group.location ?? "",
    isSession: group.type === "SESSION",
    daysOfWeek: recurring?.daysOfWeek ?? [],
    sessionDate: session?.sessionDate ?? "",
    startTime: timeValue(schedule?.startTime) || DEFAULT_TIMES.startTime,
    endTime: timeValue(schedule?.endTime) || DEFAULT_TIMES.endTime
  };
}

function sameSchedule(before, after) {
  if (!before && !after) return true;
  if (!before || !after) return false;
  return JSON.stringify(before) === JSON.stringify(after);
}

/* The saved schedule, in the shape the schedule endpoints expect. */
function currentRecurring(group) {
  const recurring = group.recurringSchedule;
  if (!recurring) return null;
  return {
    daysOfWeek: [...recurring.daysOfWeek],
    startTime: timeValue(recurring.startTime),
    endTime: timeValue(recurring.endTime)
  };
}

function currentSession(group) {
  const session = group.sessionSchedule;
  if (!session) return null;
  return {
    sessionDate: session.sessionDate,
    startTime: timeValue(session.startTime),
    endTime: timeValue(session.endTime)
  };
}

function errorDescription(error) {
  return error && typeof error === "object" && "userMessage" in error
    ? error.userMessage
    : "잠시 뒤 다시 시도해 주세요.";
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
  const saveLock = useSubmissionLock();
  const lifecycleLock = useSubmissionLock();
  const [contentTab, setContentTab] = useState("intro");
  const {
    control,
    handleSubmit,
    register,
    reset,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(manageSchema),
    defaultValues: {
      name: "",
      introduction: "",
      description: "",
      meetingType: "FLEXIBLE",
      location: "",
      isSession: false,
      daysOfWeek: [],
      sessionDate: "",
      ...DEFAULT_TIMES
    }
  });
  const description = useWatch({ control, name: "description" }) ?? "";
  const meetingType = useWatch({ control, name: "meetingType" });
  const daysOfWeek = useWatch({ control, name: "daysOfWeek" }) ?? [];
  const group = groupQuery.data;

  useEffect(() => {
    if (!group) return;
    reset(toFormValues(group));
  }, [group, reset]);

  if (groupQuery.isLoading)
    return (
      <div className="group-editor page-container">
        <Skeleton />
      </div>
    );
  if (groupQuery.error || !group) {
    return (
      <div className="group-editor page-container">
        <ErrorState
          title="모임 정보를 불러오지 못했어요."
          action={<Button onClick={() => groupQuery.refetch()}>다시 시도</Button>}
        />
      </div>
    );
  }

  const age = now.getTime() - new Date(group.createdAt).getTime();
  const canDelete = age >= 0 && age <= DAY_MS;
  const lifecycleVerb = canDelete ? "삭제" : "종료";
  const savePending = saveLock.pending || modifyMutation.isPending;

  function selectQuickDays(days) {
    setValue("daysOfWeek", days, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });
  }

  /*
   * Overview and schedule live on separate endpoints, so one save may need two
   * requests. The schedule call is skipped when nothing about it changed.
   */
  async function saveSchedule(values) {
    if (group.type === "SESSION") {
      const next = {
        sessionDate: values.sessionDate,
        startTime: values.startTime,
        endTime: values.endTime
      };
      if (sameSchedule(currentSession(group), next)) return;
      await sessionMutation.mutateAsync(next);
      return;
    }

    const next = values.daysOfWeek.length
      ? {
          daysOfWeek: values.daysOfWeek,
          startTime: values.startTime,
          endTime: values.endTime
        }
      : null;
    const before = currentRecurring(group);
    if (sameSchedule(before, next)) return;
    if (next) {
      await recurringMutation.mutateAsync(next);
      return;
    }
    await removeRecurringMutation.mutateAsync();
  }

  const save = handleSubmit(async (values) => {
    await saveLock.run(async () => {
      try {
        await modifyMutation.mutateAsync({
          name: values.name.trim(),
          introduction: values.introduction.trim(),
          description: values.description,
          meetingType: values.meetingType,
          location: values.location.trim() || null
        });
        await saveSchedule(values);
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

  async function confirmLifecycle() {
    const action = canDelete ? deleteMutation : terminateMutation;
    await lifecycleLock.run(async () => {
      try {
        await action.mutateAsync(canDelete ? undefined : { status: "ENDED" });
        toast.show({ title: `모임을 ${lifecycleVerb}했어요.`, tone: "success" });
        navigate("/my?tab=joined", { replace: true });
      } catch (error) {
        toast.show({
          title: `모임을 ${lifecycleVerb}하지 못했어요.`,
          description: errorDescription(error),
          tone: "danger"
        });
      }
    });
  }

  return (
    <div className="manage-page manage-page--editor">
      <ManagementContext active="overview" groupId={groupId} />
      <div className="group-editor group-editor--embedded">
        <form className="group-editor__overview-form" id="group-overview-form" onSubmit={save} noValidate>
          <section className="group-editor__hero" aria-label="모임 기본 정보">
            <div className="group-editor__hero-fields">
              <GroupTypeField lockedLabel={GROUP_TYPE_LABEL[group.type]} register={register} />
              <OverviewFields
                className="group-editor__overview-fields--hero"
                errors={errors}
                register={register}
              />
              <div className="group-editor__facts">
                <MeetingFields errors={errors} meetingType={meetingType} register={register} />
                <div className="group-editor__fact group-editor__fact--schedule">
                  <span className="group-editor__fact-label">모임 일정</span>
                  {group.type === "SESSION" ? (
                    <SessionScheduleFields errors={errors} register={register} />
                  ) : (
                    <RecurringScheduleFields
                      errors={errors}
                      onQuickSelect={selectQuickDays}
                      register={register}
                      selectedDays={daysOfWeek}
                    />
                  )}
                </div>
                <ReadOnlyFact
                  label="현재 멤버 수"
                  value={Number.isInteger(group.memberCount) ? `${group.memberCount}명` : "확인 중"}
                />
                <ReadOnlyFact label="개설일" value={group.createdAt?.slice(0, 10) ?? "확인 중"} />
              </div>
            </div>
            <RepresentativeImage group={group} />
          </section>

          <GroupContentTabs onSelect={setContentTab} value={contentTab} />

          {contentTab === "intro" ? (
            <section
              className="group-editor__panel group-editor__description-panel"
              aria-label="모임 상세 소개"
            >
              <MarkdownEditor
                description="제목, 목록, 인용, 링크, 코드 블럭 문법을 사용할 수 있어요."
                error={errors.description?.message}
                register={register}
                rows={7}
                setValue={setValue}
                value={description}
              />
            </section>
          ) : (
            <section className="group-editor__panel group-editor__members-tab">
              <GroupMembersPanel groupId={groupId} />
            </section>
          )}
        </form>

        {group.status === "ACTIVE" ? (
          <section
            className="group-editor__editor-footer"
            aria-label={`모임 ${lifecycleVerb} 설정`}
          >
            <div className="group-editor__actions">
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="danger">
                    모임 {lifecycleVerb}하기
                  </Button>
                }
                title={`모임을 ${lifecycleVerb}할까요?`}
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
                confirmLabel={canDelete ? "삭제" : `${lifecycleVerb} 확인`}
                danger
                pending={
                  lifecycleLock.pending ||
                  deleteMutation.isPending ||
                  terminateMutation.isPending
                }
                onConfirm={confirmLifecycle}
              />
              <Button form="group-overview-form" pending={savePending} type="submit" variant="primary">
                모임 수정하기
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
