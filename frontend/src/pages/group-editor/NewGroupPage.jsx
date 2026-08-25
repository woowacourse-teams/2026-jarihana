import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

import { useCreateGroup } from "../../features/group/index.js";
import { Button, ErrorState, useToast } from "../../shared/ui/index.js";
import {
  DescriptionField,
  GroupContentTabs,
  MarkdownPreview,
  MarkdownToolbar,
  OverviewFields,
  RecurringScheduleFields,
  SessionScheduleFields
} from "./GroupEditorFields.jsx";
import { GroupMembersPanel } from "./GroupMembersPanel.jsx";
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
  if (values.type !== "SESSION" && values.daysOfWeek.length === 0) {
    context.addIssue({
      code: "custom",
      message: "활동 요일을 하나 이상 선택해 주세요.",
      path: ["daysOfWeek"]
    });
  }
  if (values.type === "SESSION" && !/^\d{4}-\d{2}-\d{2}$/.test(values.sessionDate)) {
    context.addIssue({
      code: "custom",
      message: "진행 날짜를 입력해 주세요.",
      path: ["sessionDate"]
    });
  }
});

function toCreateBody(values) {
  const common = {
    type: values.type,
    name: values.name.trim(),
    introduction: values.introduction.trim(),
    description: values.description,
    meetingType: "FLEXIBLE",
    location: null
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
    recurringSchedule: {
      daysOfWeek: values.daysOfWeek,
      startTime: values.startTime,
      endTime: values.endTime
    },
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
    getValues,
    register,
    handleSubmit,
    setFocus,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(newGroupSchema),
    defaultValues: {
      type: "STUDY",
      name: "",
      introduction: "",
      description: "",
      daysOfWeek: [],
      sessionDate: "",
      startTime: "19:00",
      endTime: "21:00"
    }
  });
  const type = useWatch({ control, name: "type" });
  const description = useWatch({ control, name: "description" }) ?? "";
  const [preview, setPreview] = useState(false);
  const [contentTab, setContentTab] = useState("intro");

  function insertMarkdown(snippet) {
    const current = getValues("description") ?? "";
    setValue("description", `${current}${snippet}`.slice(0, 5000), {
      shouldDirty: true,
      shouldValidate: true
    });
    setPreview(false);
    setFocus("description");
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
        <nav aria-label="모임 생성 단계" className="group-editor__route-tabs">
          <span aria-current="page">모임 생성</span>
          <span aria-disabled="true" title="모임을 만든 뒤 모집을 설정할 수 있어요.">
            모집 관리
          </span>
        </nav>
      </header>
      {createMutation.error ? (
        <ErrorState
          title="모임을 만들지 못했어요."
          description={createMutation.error.userMessage}
        />
      ) : null}
      <form className="group-editor__create-form" onSubmit={submit} noValidate>
        <section
          className="group-editor__hero group-editor__hero--draft"
          aria-labelledby="new-group-overview"
        >
          <div className="group-editor__hero-fields">
            <h2 className="group-editor__visually-hidden" id="new-group-overview">
              모임 기본 정보
            </h2>
            <OverviewFields
              className="group-editor__overview-fields--hero"
              errors={errors}
              register={register}
              showDescription={false}
              showType
            />
            <div className="group-editor__hero-schedule">
              <h3>활동 일정</h3>
              {type === "SESSION" ? (
                <SessionScheduleFields errors={errors} register={register} />
              ) : (
                <RecurringScheduleFields errors={errors} register={register} compact />
              )}
            </div>
          </div>
          <aside className="group-editor__image-panel">
            <img
              className="group-editor__representative-image group-editor__representative-image--draft"
              src="/images/default-group.png"
              alt="서버 기본 모임 대표"
            />
            <strong>서버 기본 대표 이미지</strong>
            <p>현재 API는 이미지 업로드를 지원하지 않아 생성 시 서버 기본 이미지가 적용돼요.</p>
          </aside>
        </section>

        <GroupContentTabs onSelect={setContentTab} value={contentTab} />

        {contentTab === "intro" ? (
          <section
            className="group-editor__panel group-editor__description-panel"
            aria-labelledby="new-group-description"
          >
            <div className="group-editor__description-heading">
              <h2 id="new-group-description">모임 소개 · Markdown</h2>
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
            <MarkdownToolbar onInsert={insertMarkdown} />
            {preview ? (
              <MarkdownPreview value={description} />
            ) : (
              <DescriptionField
                description="제목 · 목록 · 인용 · 링크 문법을 사용할 수 있어요."
                error={errors.description?.message}
                label="모임 소개"
                register={register}
                rows={8}
              />
            )}
            <CreateFooter
              descriptionLength={description.length}
              onCancel={() => navigate("/groups")}
              pending={createMutation.isPending || createLock.pending}
            />
          </section>
        ) : (
          <section className="group-editor__panel group-editor__members-tab">
            <GroupMembersPanel />
            <CreateFooter
              descriptionLength={description.length}
              onCancel={() => navigate("/groups")}
              pending={createMutation.isPending || createLock.pending}
            />
          </section>
        )}
      </form>
    </div>
  );
}

function CreateFooter({ descriptionLength, onCancel, pending }) {
  return (
    <div className="group-editor__editor-footer">
      <span>{descriptionLength.toLocaleString()} / 5,000자</span>
      <div className="group-editor__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          모임 만들기
        </Button>
      </div>
    </div>
  );
}
