import { useState } from "react";

import { Button, Textarea } from "../../shared/ui/index.js";
import { useCreateFeedback } from "./hooks.js";
import "./feedback.css";

const CONTENT_MAX_LENGTH = 1_000;

export function FeedbackForm({ onSuccess }) {
  const [content, setContent] = useState("");
  const [contentError, setContentError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const feedback = useCreateFeedback();

  async function submit(event) {
    event.preventDefault();
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      setContentError("피드백 내용을 입력해 주세요.");
      return;
    }

    setContentError("");
    setSubmissionError("");
    try {
      await feedback.mutateAsync({ content: normalizedContent });
      onSuccess();
    } catch {
      setSubmissionError("피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <form
      className="feedback-form"
      data-ph-capture-attribute-action="feedback_form_submit"
      onSubmit={submit}
    >
      <Textarea
        aria-label="피드백 내용"
        data-ph-capture-attribute-action="feedback_content_change"
        description={
          <span className="feedback-form__character-count">
            {content.length}/{CONTENT_MAX_LENGTH}
          </span>
        }
        error={contentError}
        className="feedback-form__textarea"
        maxLength={CONTENT_MAX_LENGTH}
        onChange={(event) => {
          setContent(event.target.value);
          setContentError("");
          setSubmissionError("");
        }}
        placeholder="자리하나?를 사용하며 느낀 점을 자유롭게 남겨 주세요!"
        required
        value={content}
      />
      {submissionError ? (
        <p className="feedback-form__error" role="alert">
          {submissionError}
        </p>
      ) : null}
      <div className="ui-dialog__actions feedback-form__actions">
        <Button
          data-ph-capture-attribute-action="feedback_submit"
          pending={feedback.isPending}
          pendingLabel="전송 중"
          type="submit"
        >
          피드백 보내기
        </Button>
      </div>
    </form>
  );
}
