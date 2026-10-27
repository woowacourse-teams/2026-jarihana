import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Link, useNavigate } from "react-router";

import {
  PROPOSAL_CATEGORIES,
  PROPOSAL_CONTENT_MAX_LENGTH,
  PROPOSAL_MOOD_OPTION_MAX_COUNT,
  PROPOSAL_MOOD_OPTION_MAX_LENGTH,
  PROPOSAL_TITLE_MAX_LENGTH,
  validateProposalForm
} from "../../entities/proposal/index.js";
import { useCreateProposal } from "../../features/proposal/hooks.js";
import { toUserMessage } from "../../shared/api/index.js";
import { Button, PageContainer, PageHeader, Textarea, TextField } from "../../shared/ui/index.js";
import "./proposals.css";

export function ProposalCreatePage() {
  const navigate = useNavigate();
  const createProposal = useCreateProposal();
  const [category, setCategory] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [moodOptions, setMoodOptions] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  function changeMoodOption(index, value) {
    setMoodOptions((current) => current.map((option, position) => (position === index ? value : option)));
  }

  function submit(event) {
    event.preventDefault();
    const { errors: nextErrors, values } = validateProposalForm({ category, content, moodOptions, title });
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length) {
      const firstField = ["category", "title", "content", "moodOptions"].find((field) => nextErrors[field]);
      document.querySelector(`[data-proposal-field="${firstField}"]`)?.focus();
      return;
    }
    createProposal.mutate(values, {
      onError: (error) => setSubmitError(toUserMessage(error?.code)),
      onSuccess: ({ id }) => navigate(`/board/${id}`, { replace: true })
    });
  }

  return (
    <PageContainer className="proposal-page proposal-create">
      <PageHeader
        description="아직 작은 생각이어도 좋아요. 함께할 사람이 있는지 먼저 물어봐요."
        eyebrow="자유게시판"
        title="모임 제안하기"
      />
      <form
        className="proposal-form"
        data-ph-capture-attribute-action="proposal_create_form"
        noValidate
        onSubmit={submit}
      >
        <fieldset className="proposal-form__group">
          <legend className="proposal-form__legend">
            분야
            <span className="ui-field__required" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="proposal-chips__list">
            {PROPOSAL_CATEGORIES.map((item, index) => (
              <button
                aria-pressed={category === item.code}
                className="proposal-chip"
                data-ph-capture-attribute-action="proposal_create_category"
                data-proposal-field={index === 0 ? "category" : undefined}
                key={item.code}
                onClick={() => setCategory(item.code)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          {errors.category ? <p className="ui-field__error">{errors.category}</p> : null}
        </fieldset>

        <TextField
          data-ph-capture-attribute-action="proposal_create_title"
          data-proposal-field="title"
          description={`${title.length} / ${PROPOSAL_TITLE_MAX_LENGTH}`}
          error={errors.title}
          label="제목"
          maxLength={PROPOSAL_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 각자 읽고 같이 나누는 독서 모임 어때요?"
          required
          value={title}
        />

        <Textarea
          data-ph-capture-attribute-action="proposal_create_content"
          data-proposal-field="content"
          description={`${content.length} / ${PROPOSAL_CONTENT_MAX_LENGTH}`}
          error={errors.content}
          label="어떤 모임인가요?"
          maxLength={PROPOSAL_CONTENT_MAX_LENGTH}
          onChange={(event) => setContent(event.target.value)}
          placeholder="하고 싶은 활동, 바라는 분위기, 얼마나 자주 모일지 자유롭게 적어 주세요."
          required
          rows={8}
          value={content}
        />

        <fieldset className="proposal-form__group">
          <legend className="proposal-chips__label">
            함께 기대하는 분위기<span>선택, 3개까지</span>
          </legend>
          <p className="proposal-note">
            응답하는 사람이 고를 수 있는 선택지예요. 올린 뒤에는 바꿀 수 없어요. 시간과 진행 방식은 따로 묻지 않아도 함께 물어봐요.
          </p>
          {moodOptions.map((option, index) => (
            <div className="proposal-form__mood" key={index}>
              <TextField
                aria-label={`분위기 선택지 ${index + 1}`}
                data-ph-capture-attribute-action="proposal_create_mood_option"
                data-proposal-field={index === 0 ? "moodOptions" : undefined}
                maxLength={PROPOSAL_MOOD_OPTION_MAX_LENGTH}
                onChange={(event) => changeMoodOption(index, event.target.value)}
                placeholder="예: 초보 환영"
                value={option}
              />
              <button
                aria-label={`분위기 선택지 ${index + 1} 지우기`}
                className="proposal-form__mood-remove"
                data-ph-capture-attribute-action="proposal_create_mood_remove"
                onClick={() => setMoodOptions((current) => current.filter((_, position) => position !== index))}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          ))}
          {moodOptions.length < PROPOSAL_MOOD_OPTION_MAX_COUNT ? (
            <Button
              data-ph-capture-attribute-action="proposal_create_mood_add"
              onClick={() => setMoodOptions((current) => [...current, ""])}
              size="sm"
              variant="secondary"
            >
              <Plus aria-hidden="true" size={15} />
              선택지 더하기
            </Button>
          ) : null}
          {errors.moodOptions ? <p className="ui-field__error">{errors.moodOptions}</p> : null}
        </fieldset>

        {submitError ? (
          <p className="ui-field__error" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="proposal-form__actions">
          <Link
            className="ui-button ui-button--secondary ui-button--md"
            data-ph-capture-attribute-action="proposal_create_cancel"
            to="/board"
          >
            <span>취소</span>
          </Link>
          <Button
            data-ph-capture-attribute-action="proposal_create_submit"
            pending={createProposal.isPending}
            type="submit"
          >
            제안 올리기
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
