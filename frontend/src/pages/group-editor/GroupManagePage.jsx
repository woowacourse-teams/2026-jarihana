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
import {
  DEFAULT_GROUP_IMAGE_URL,
  isDefaultGroupImageUrl,
  representativeImageKeyFromUrl,
  useImageUpload
} from "../../features/image-upload/index.js";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  GroupImage,
  Skeleton,
  Tabs,
  useToast
} from "../../shared/ui/index.js";
import { scheduleLines, typeLabel } from "../groups/pageUtils.js";
import {
  ReadOnlyFact,
  RepresentativeImageNotice,
  ScheduleFact,
  UnderlineField,
  UnderlineSelect
} from "./EditorFields.jsx";
import { GroupMembersPanel } from "./GroupMembersPanel.jsx";
import { MarkdownEditor } from "./MarkdownEditor.jsx";
import { ScheduleDialog } from "./ScheduleDialog.jsx";
import { useSubmissionLock } from "./useSubmissionLock.js";
import { ManagementContext } from "../manage/ManagementContext.jsx";
import "../manage/manage.css";
import "../groups/groups.css";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "시간을 입력해 주세요.");

const manageSchema = z
  .object({
    name: z.string().trim().min(1, "모임 이름을 입력해 주세요.").max(50),
    introduction: z.string().trim().min(1, "한 줄 소개를 입력해 주세요.").max(100),
    description: z.string().max(10_000, "10,000자 이하로 입력해 주세요."),
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
    /* 유동적 일정은 시간을 보내지 않으므로 비교하지 않는다. */
    const usesTime = values.isSession || values.daysOfWeek.length > 0;
    if (usesTime && values.endTime <= values.startTime) {
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
  const imageUpload = useImageUpload();
  const saveLock = useSubmissionLock();
  const lifecycleLock = useSubmissionLock();
  const [contentTab, setContentTab] = useState("intro");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [representativeImageDraft, setRepresentativeImageDraft] = useState(null);

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    trigger
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

  const values = useWatch({ control });
  const description = values.description ?? "";
  const daysOfWeek = values.daysOfWeek ?? [];
  const group = groupQuery.data;

  useEffect(
    () => () => {
      if (representativeImageDraft?.previewUrl) {
        URL.revokeObjectURL(representativeImageDraft.previewUrl);
      }
    },
    [representativeImageDraft?.previewUrl]
  );

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

  const isSession = group.type === "SESSION";
  const persistedRepresentativeImageKey = Object.prototype.hasOwnProperty.call(
    group,
    "representativeImageKey"
  )
    ? group.representativeImageKey
    : representativeImageKeyFromUrl(group.representativeImageUrl);
  const hasRepresentativeImageDraft = representativeImageDraft?.groupId === group.id;
  const representativeImageKey = hasRepresentativeImageDraft
    ? representativeImageDraft.key
    : persistedRepresentativeImageKey;
  const representativeImageUrl = hasRepresentativeImageDraft
    ? representativeImageDraft.previewUrl || group.representativeImageUrl || DEFAULT_GROUP_IMAGE_URL
    : group.representativeImageUrl || DEFAULT_GROUP_IMAGE_URL;
  const representativeImageChanged = hasRepresentativeImageDraft && representativeImageDraft.changed;
  const age = now.getTime() - new Date(group.createdAt).getTime();
  const canDelete = age >= 0 && age <= DAY_MS;
  const lifecycleVerb = canDelete ? "삭제" : "종료";
  const savePending = saveLock.pending || modifyMutation.isPending || imageUpload.isPending;

  /* 일정 오류는 모달 안에만 두면 닫는 순간 사라지므로 히어로에도 함께 보여준다. */
  const scheduleError =
    errors.sessionDate?.message ??
    errors.daysOfWeek?.message ??
    errors.startTime?.message ??
    errors.endTime?.message;

  function selectPreset(days) {
    setValue("daysOfWeek", days, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  }

  async function confirmSchedule(event) {
    event.preventDefault();
    const fields = isSession ? ["sessionDate", "startTime", "endTime"] : ["startTime", "endTime"];
    if (!(await trigger(fields))) return;
    setScheduleOpen(false);
  }

  /* 저장은 한 번이지만 일정은 별도 엔드포인트라, 바뀌었을 때만 두 번째 요청이 나간다. */
  async function saveSchedule(formValues) {
    if (isSession) {
      const next = {
        sessionDate: formValues.sessionDate,
        startTime: formValues.startTime,
        endTime: formValues.endTime
      };
      if (sameSchedule(currentSession(group), next)) return;
      await sessionMutation.mutateAsync(next);
      return;
    }
    const next = formValues.daysOfWeek.length
      ? {
          daysOfWeek: formValues.daysOfWeek,
          startTime: formValues.startTime,
          endTime: formValues.endTime
        }
      : null;
    if (sameSchedule(currentRecurring(group), next)) return;
    if (next) {
      await recurringMutation.mutateAsync(next);
      return;
    }
    await removeRecurringMutation.mutateAsync();
  }

  const save = handleSubmit(async (formValues) => {
    if (imageUpload.isPending) return;
    const existingImageIsCustom =
      Boolean(group.representativeImageUrl) &&
      !isDefaultGroupImageUrl(group.representativeImageUrl);
    if (existingImageIsCustom && !representativeImageKey && !representativeImageChanged) {
      toast.show({
        title: "대표 이미지 정보를 확인하지 못했어요.",
        description: "대표 이미지를 다시 선택한 뒤 저장해 주세요.",
        tone: "danger"
      });
      return;
    }
    await saveLock.run(async () => {
      try {
        await modifyMutation.mutateAsync({
          name: formValues.name.trim(),
          introduction: formValues.introduction.trim(),
          description: formValues.description,
          meetingType: formValues.meetingType,
          location: formValues.location.trim() || null,
          representativeImageKey: representativeImageKey ?? null
        });
        await saveSchedule(formValues);
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

  const summary = scheduleLines({
    type: group.type,
    recurringSchedule: daysOfWeek.length
      ? { daysOfWeek, startTime: values.startTime, endTime: values.endTime }
      : null,
    sessionSchedule: isSession
      ? {
          sessionDate: values.sessionDate,
          startTime: values.startTime,
          endTime: values.endTime
        }
      : null
  });

  return (
    <div className="manage-page manage-page--editor">
      <ManagementContext active="overview" groupId={groupId} />
      <div className="group-editor group-editor--embedded">
        <form id="group-overview-form" onSubmit={save} noValidate>
          <section aria-label="모임 기본 정보" className="group-profile group-editor__profile">
            <div className="group-profile__copy">
              <p className="groups-eyebrow group-profile__type-tag group-editor__type-static">
                <span>{typeLabel(group.type)}</span>
              </p>

              <UnderlineField
                className="group-editor__field--title"
                error={errors.name?.message}
                label="모임 이름"
                labelHidden
                maxLength={50}
                registration={register("name")}
              />
              <UnderlineField
                className="group-editor__field--intro"
                error={errors.introduction?.message}
                label="한 줄 소개"
                labelHidden
                maxLength={100}
                registration={register("introduction")}
              />

              <div className="group-info">
                <h2 className="group-info-title">모임 정보</h2>
                <dl className="group-facts">
                  <div className="group-fact group-fact--field">
                    <div>
                      <UnderlineSelect
                        error={errors.meetingType?.message}
                        label="모임 방식"
                        registration={register("meetingType")}
                      >
                        <option value="OFFLINE">오프라인</option>
                        <option value="ONLINE">온라인</option>
                        <option value="FLEXIBLE">유동적</option>
                      </UnderlineSelect>
                    </div>
                  </div>
                  <ScheduleFact
                    error={scheduleError}
                    lines={summary}
                    onEdit={() => setScheduleOpen(true)}
                  />
                  <div className="group-fact group-fact--field">
                    <div>
                      <UnderlineField
                        error={errors.location?.message}
                        label="장소"
                        maxLength={255}
                        placeholder="정해지면 입력해요"
                        registration={register("location")}
                      />
                    </div>
                  </div>
                  <ReadOnlyFact
                    label="현재 멤버 수"
                    value={Number.isInteger(group.memberCount) ? `${group.memberCount}명` : "확인 중"}
                  />
                </dl>
              </div>
            </div>
            <RepresentativeImageNotice
              hasCustomImage={
                Boolean(representativeImageKey) &&
                !isDefaultGroupImageUrl(representativeImageUrl)
              }
              onImageKeyChange={(nextImageKey) => {
                setRepresentativeImageDraft({
                  changed: true,
                  groupId: group.id,
                  key: nextImageKey,
                  previewUrl: representativeImageDraft?.previewUrl || null
                });
              }}
              onPreviewChange={(file) => {
                const previewUrl = URL.createObjectURL(file);
                setRepresentativeImageDraft((previous) => ({
                  changed: true,
                  groupId: group.id,
                  key: previous?.key || representativeImageKey,
                  previewUrl
                }));
              }}
              onUpload={imageUpload.mutateAsync}
              uploadError={imageUpload.error}
              uploadPending={imageUpload.isPending}
            />
            <div className="group-profile__art">
              <GroupImage
                alt=""
                className="group-profile__image"
                group={{ ...group, representativeImageUrl }}
              />
            </div>
          </section>

          <div className="group-detail-tabs group-editor__tabs">
            <Tabs
              animated
              onValueChange={setContentTab}
              value={contentTab}
              items={[
                {
                  label: "소개",
                  value: "intro",
                  content: (
                    <MarkdownEditor
                      description="제목, 목록, 인용, 링크, 코드 블럭 문법을 사용할 수 있어요."
                      error={errors.description?.message}
                      register={register}
                      rows={7}
                      setValue={setValue}
                      value={description}
                    />
                  )
                },
                {
                  label: "멤버",
                  value: "members",
                  content: <GroupMembersPanel groupId={groupId} />
                }
              ]}
            />
          </div>
        </form>

        {group.status === "ACTIVE" ? (
          <section aria-label={`모임 ${lifecycleVerb} 설정`} className="group-editor__actions">
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
                lifecycleLock.pending || deleteMutation.isPending || terminateMutation.isPending
              }
              onConfirm={confirmLifecycle}
            />
            <Button
              form="group-overview-form"
              pending={savePending}
              type="submit"
              variant="primary"
            >
              모임 수정하기
            </Button>
          </section>
        ) : null}

        <ScheduleDialog
          errors={errors}
          isSession={isSession}
          onClose={() => setScheduleOpen(false)}
          onPresetSelect={selectPreset}
          onSubmit={confirmSchedule}
          open={scheduleOpen}
          register={register}
          selectedDays={daysOfWeek}
        />
      </div>
    </div>
  );
}
