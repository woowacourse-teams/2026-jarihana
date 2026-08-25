import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

import { useCreateGroup } from "../../features/group/index.js";
import { Button, ErrorState, useToast } from "../../shared/ui/index.js";
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

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "시간을 입력해 주세요.");
const baseSchema = z.object({
  type: z.enum(["CLUB", "STUDY", "SESSION"]),
  name: z
    .string()
    .trim()
    .min(1, "모임 이름을 입력해 주세요.")
    .max(50, "50자 이하로 입력해 주세요."),
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
  /*
   * CLUB and STUDY may be created without any day: the domain treats a missing
   * recurringSchedule as a flexible schedule, so an empty selection is a valid
   * choice rather than a mistake.
   */
  if (values.type === "SESSION" && !/^\d{4}-\d{2}-\d{2}$/.test(values.sessionDate)) {
    context.addIssue({
      code: "custom",
      message: "진행 날짜를 입력해 주세요.",
      path: ["sessionDate"]
    });
  }
});

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
      ? {
          daysOfWeek: values.daysOfWeek,
          startTime: values.startTime,
          endTime: values.endTime
        }
      : null,
    sessionSchedule: null
  };
}

function safeErrorDescription(error) {
  return error && typeof error === "object" && "userMessage" in error
    ? error.userMessage
    : "잠시 뒤 다시 시도해 주세요.";
}

export function NewGroupPage() {
  const navigate = useNavigate();
  const createMutation = useCreateGroup();
  const createLock = useSubmissionLock();
  const toast = useToast();
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors }
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
  const type = useWatch({ control, name: "type" });
  const meetingType = useWatch({ control, name: "meetingType" });
  const description = useWatch({ control, name: "description" }) ?? "";
  const daysOfWeek = useWatch({ control, name: "daysOfWeek" }) ?? [];
  const [contentTab, setContentTab] = useState("intro");

  function selectQuickDays(days) {
    setValue("daysOfWeek", days, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });
  }

  const submit = handleSubmit(async (values) => {
    await createLock.run(async () => {
      try {
        const result = await createMutation.mutateAsync(toCreateBody(values));
        toast.show({ title: "모임을 만들었어요.", tone: "success" });
        navigate(`/groups/${result.id}/manage`);
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
      <form className="group-editor__create-form" id="group-create-form" onSubmit={submit} noValidate>
        <section className="group-editor__hero" aria-label="모임 기본 정보">
          <div className="group-editor__hero-fields">
            <GroupTypeField error={errors.type?.message} register={register} />
            <OverviewFields
              className="group-editor__overview-fields--hero"
              errors={errors}
              register={register}
            />
            <div className="group-editor__facts">
              <MeetingFields errors={errors} meetingType={meetingType} register={register} />
              <div className="group-editor__fact group-editor__fact--schedule">
                <span className="group-editor__fact-label">모임 일정</span>
                {type === "SESSION" ? (
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
              <ReadOnlyFact label="현재 멤버 수" value="개설자 1명" />
              <ReadOnlyFact label="개설일" value="저장하면 기록돼요" />
            </div>
          </div>
          <RepresentativeImage />
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
              rows={8}
              setValue={setValue}
              value={description}
            />
          </section>
        ) : (
          <section className="group-editor__panel group-editor__members-tab">
            <GroupMembersPanel />
          </section>
        )}
      </form>

      <div className="group-editor__editor-footer">
        <div className="group-editor__actions">
          <Button type="button" variant="secondary" onClick={() => navigate("/groups")}>
            취소
          </Button>
          <Button
            form="group-create-form"
            type="submit"
            variant="primary"
            pending={createMutation.isPending || createLock.pending}
          >
            모임 만들기
          </Button>
        </div>
      </div>
    </div>
  );
}
