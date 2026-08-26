import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

import { useCreateGroup } from "../../features/group/index.js";
import { Button, ErrorState, GroupImage, Tabs, useToast } from "../../shared/ui/index.js";
import { scheduleLines } from "../groups/pageUtils.js";
import { ReadOnlyFact, ScheduleFact, UnderlineField, UnderlineSelect } from "./EditorFields.jsx";
import { GroupMembersPanel } from "./GroupMembersPanel.jsx";
import { MarkdownEditor } from "./MarkdownEditor.jsx";
import { ScheduleDialog } from "./ScheduleDialog.jsx";
import { useSubmissionLock } from "./useSubmissionLock.js";
import "../groups/groups.css";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "시간을 입력해 주세요.");

const baseSchema = z.object({
  type: z.enum(["CLUB", "STUDY", "SESSION"]),
  name: z.string().trim().min(1, "모임 이름을 입력해 주세요.").max(50, "50자 이하로 입력해 주세요."),
  introduction: z
    .string()
    .trim()
    .min(1, "한 줄 소개를 입력해 주세요.")
    .max(100, "100자 이하로 입력해 주세요."),
  description: z.string().max(5000, "5,000자 이하로 입력해 주세요."),
  meetingType: z.enum(["ONLINE", "OFFLINE", "FLEXIBLE"]),
  location: z.string().max(255, "255자 이하로 입력해 주세요."),
  daysOfWeek: z.array(
    z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])
  ),
  sessionDate: z.string(),
  startTime: timeSchema,
  endTime: timeSchema
});

export const newGroupSchema = baseSchema.superRefine((values, context) => {
  if (values.endTime <= values.startTime) {
    context.addIssue({
      code: "custom",
      message: "종료 시간은 시작 시간보다 늦어야 해요.",
      path: ["endTime"]
    });
  }
  /* CLUB과 STUDY는 요일이 없어도 된다. 도메인상 그것이 곧 유동적 일정이다. */
  if (values.type === "SESSION" && !/^\d{4}-\d{2}-\d{2}$/.test(values.sessionDate)) {
    context.addIssue({
      code: "custom",
      message: "진행 날짜를 입력해 주세요.",
      path: ["sessionDate"]
    });
  }
});

/*
 * 종류를 바꿔도 폼의 일정 값은 그대로 둔다. 저장할 때만 종류에 맞는 쪽을 보내므로,
 * 실수로 종류를 바꿨다 되돌려도 다시 입력할 필요가 없다.
 */
function toCreateBody(values) {
  const location = values.location.trim();
  const common = {
    type: values.type,
    name: values.name.trim(),
    introduction: values.introduction.trim(),
    description: values.description,
    meetingType: values.meetingType,
    location: location || null
  };
  if (values.type === "SESSION") {
    return {
      ...common,
      recurringSchedule: null,
      sessionSchedule: {
        sessionDate: values.sessionDate,
        startTime: values.startTime,
        endTime: values.endTime
      }
    };
  }
  return {
    ...common,
    recurringSchedule: values.daysOfWeek.length
      ? { daysOfWeek: values.daysOfWeek, startTime: values.startTime, endTime: values.endTime }
      : null,
    sessionSchedule: null
  };
}

function safeErrorDescription(error) {
  return error && typeof error === "object" && "userMessage" in error
    ? error.userMessage
    : "잠시 뒤 다시 시도해 주세요.";
}

/* 히어로 요약은 상세 페이지와 같은 함수를 쓴다. */
function draftSummary(values) {
  if (values.type === "SESSION") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.sessionDate)) return ["일정 설정하기"];
    return scheduleLines({
      type: values.type,
      recurringSchedule: null,
      sessionSchedule: {
        sessionDate: values.sessionDate,
        startTime: values.startTime,
        endTime: values.endTime
      }
    });
  }
  if (!values.daysOfWeek.length) return ["유동적"];
  return scheduleLines({
    type: values.type,
    recurringSchedule: {
      daysOfWeek: values.daysOfWeek,
      startTime: values.startTime,
      endTime: values.endTime
    },
    sessionSchedule: null
  });
}

export function NewGroupPage() {
  const navigate = useNavigate();
  const createMutation = useCreateGroup();
  const createLock = useSubmissionLock();
  const toast = useToast();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [contentTab, setContentTab] = useState("intro");

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setValue,
    trigger
  } = useForm({
    resolver: zodResolver(newGroupSchema),
    defaultValues: {
      type: "STUDY",
      name: "",
      introduction: "",
      description: "",
      meetingType: "FLEXIBLE",
      location: "",
      daysOfWeek: [],
      sessionDate: "",
      startTime: "19:00",
      endTime: "21:00"
    }
  });

  const values = useWatch({ control });
  const type = values.type ?? "STUDY";
  const description = values.description ?? "";
  const daysOfWeek = values.daysOfWeek ?? [];

  function selectPreset(days) {
    setValue("daysOfWeek", days, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  }

  async function confirmSchedule(event) {
    event.preventDefault();
    const fields = type === "SESSION" ? ["sessionDate", "startTime", "endTime"] : ["startTime", "endTime"];
    if (!(await trigger(fields))) return;
    setScheduleOpen(false);
  }

  const submit = handleSubmit(async (formValues) => {
    await createLock.run(async () => {
      try {
        const result = await createMutation.mutateAsync(toCreateBody(formValues));
        toast.show({ title: "모임을 만들었어요.", tone: "success" });
        navigate(`/groups/${result.id}`);
      } catch (error) {
        toast.show({
          title: "모임을 만들지 못했어요.",
          description: safeErrorDescription(error),
          tone: "danger"
        });
      }
    });
  });

  return (
    <div className="group-editor group-editor--create page-container">
      <header className="group-editor__heading">
        <h1>신규 모임 생성</h1>
        <p className="group-editor__heading-note">
          모집 설정, 신청 관리, 멤버 관리는 모임을 만든 뒤 관리 화면에서 이어서 할 수 있어요.
        </p>
      </header>

      {createMutation.error ? (
        <ErrorState
          title="모임을 만들지 못했어요."
          description={createMutation.error.userMessage}
        />
      ) : null}

      <form id="group-create-form" onSubmit={submit} noValidate>
        <section
          aria-label="모임 기본 정보"
          className="group-profile group-profile--default-image group-editor__profile"
        >
          <div className="group-profile__copy">
            <UnderlineSelect
              className="group-editor__type-field"
              error={errors.type?.message}
              label="모임 종류"
              labelHidden
              registration={register("type")}
            >
              <option value="STUDY">스터디</option>
              <option value="CLUB">동아리</option>
              <option value="SESSION">세션</option>
            </UnderlineSelect>

            <UnderlineField
              className="group-editor__field--title"
              error={errors.name?.message}
              label="모임 이름"
              labelHidden
              maxLength={50}
              placeholder="모임 이름을 입력해 주세요"
              registration={register("name")}
            />
            <UnderlineField
              className="group-editor__field--intro"
              error={errors.introduction?.message}
              label="한 줄 소개"
              labelHidden
              maxLength={100}
              placeholder="한 줄로 모임을 소개해 주세요"
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
                  actionLabel="설정"
                  lines={draftSummary({ ...values, daysOfWeek, type })}
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
                <ReadOnlyFact label="현재 멤버 수" value="개설자 1명" />
              </dl>
            </div>
          </div>
          <div className="group-profile__art">
            <GroupImage alt="" className="group-profile__image" group={{}} />
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
                    rows={8}
                    setValue={setValue}
                    value={description}
                  />
                )
              },
              {
                label: "멤버",
                value: "members",
                content: <GroupMembersPanel />
              }
            ]}
          />
        </div>
      </form>

      <div className="group-editor__actions">
        <Button onClick={() => navigate("/groups")} type="button" variant="secondary">
          취소
        </Button>
        <Button
          form="group-create-form"
          pending={createMutation.isPending || createLock.pending}
          type="submit"
          variant="primary"
        >
          모임 만들기
        </Button>
      </div>

      <ScheduleDialog
        errors={errors}
        isSession={type === "SESSION"}
        onClose={() => setScheduleOpen(false)}
        onPresetSelect={selectPreset}
        onSubmit={confirmSchedule}
        open={scheduleOpen}
        register={register}
        selectedDays={daysOfWeek}
      />
    </div>
  );
}
