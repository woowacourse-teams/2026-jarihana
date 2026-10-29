import { useRef, useState } from "react";
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
import { ProposalCategoryIcon } from "./ProposalCategoryIcon.jsx";
import "./proposals.css";

export function ProposalCreatePage() {
  const navigate = useNavigate();
  const createProposal = useCreateProposal();
  const [category, setCategory] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [moodOptions, setMoodOptions] = useState([]);
  const [moodDraft, setMoodDraft] = useState("");
  const [moodError, setMoodError] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const commitAfterCompositionRef = useRef(false);
  const moodInputRef = useRef(null);

  /** 입력한 선택지를 칩으로 더한다. 빈 값은 건너뛰고, 겹치거나 길거나 3개를 넘으면 더하지 않고 알린다. */
  function addMoodOptions(candidates) {
    if (!candidates.some((candidate) => candidate.replace(/,+$/, "").trim())) return;
    const next = [...moodOptions];
    let error = null;
    for (const candidate of candidates) {
      const option = candidate.replace(/,+$/, "").trim();
      if (!option) continue;
      if (option.length > PROPOSAL_MOOD_OPTION_MAX_LENGTH) {
        error = "분위기 선택지는 20자 이하여야 해요.";
      } else if (next.includes(option)) {
        error = "이미 더한 선택지예요.";
      } else if (next.length >= PROPOSAL_MOOD_OPTION_MAX_COUNT) {
        error = "분위기 선택지는 3개까지 정할 수 있어요.";
      } else {
        next.push(option);
      }
    }
    setMoodOptions(next);
    setMoodError(error);
    setErrors((current) => ({ ...current, moodOptions: undefined }));
  }

  // 쉼표 뒤에 띄어 쓰면 쉼표 앞까지를 선택지로 더하고, 붙여 넣은 "가, 나, 다"도 한 번에 나눈다.
  function changeMoodDraft(value) {
    if (!/,\s/.test(value)) {
      setMoodDraft(value);
      return;
    }
    const parts = value.split(/,\s+/);
    const rest = parts.pop();
    addMoodOptions(parts);
    setMoodDraft(rest);
  }

  function commitMoodDraft(value = moodDraft) {
    addMoodOptions([value]);
    setMoodDraft("");
  }

  function handleMoodKeyDown(event) {
    if (event.key === "Enter") {
      // 폼 제출로 이어지지 않게 막는다. 한글 조합 중이면 조합이 끝난 뒤에 더한다.
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        commitAfterCompositionRef.current = true;
        return;
      }
      commitMoodDraft(event.currentTarget.value);
      return;
    }
    if (event.key === "Backspace" && !moodDraft && moodOptions.length) {
      setMoodOptions((current) => current.slice(0, -1));
      setMoodError(null);
    }
  }

  // 브라우저마다 조합이 끝난 뒤 입력이나 Enter 이벤트가 한 번 더 올 수 있어, 한 틱 뒤의 실제 입력값으로 더한다.
  // 그 사이 다른 경로로 이미 더했다면 입력값이 비어 있어 아무 일도 하지 않는다.
  function handleMoodCompositionEnd() {
    if (!commitAfterCompositionRef.current) return;
    commitAfterCompositionRef.current = false;
    window.setTimeout(() => commitMoodDraft(moodInputRef.current?.value ?? ""));
  }

  function submit(event) {
    event.preventDefault();
    // 칩으로 더하지 않고 입력창에 남긴 선택지도 함께 올린다.
    const pendingOption = moodDraft.replace(/,+$/, "").trim();
    const { errors: nextErrors, values } = validateProposalForm({
      category,
      content,
      moodOptions: pendingOption ? [...moodOptions, pendingOption] : moodOptions,
      title
    });
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
                <ProposalCategoryIcon code={item.code} />
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
          {moodOptions.length ? (
            <ul aria-label="더한 분위기 선택지" className="proposal-form__tags">
              {moodOptions.map((option) => (
                <li className="proposal-form__tag" key={option}>
                  {option}
                  <button
                    aria-label={`${option} 선택지 지우기`}
                    className="proposal-form__tag-remove"
                    data-ph-capture-attribute-action="proposal_create_mood_remove"
                    onClick={() => {
                      setMoodOptions((current) => current.filter((item) => item !== option));
                      setMoodError(null);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {moodOptions.length < PROPOSAL_MOOD_OPTION_MAX_COUNT ? (
            <div className="proposal-form__mood">
              <TextField
                aria-label="분위기 선택지 입력"
                data-ph-capture-attribute-action="proposal_create_mood_option"
                data-proposal-field="moodOptions"
                description="Enter를 누르거나 쉼표 뒤에 띄어 쓰면 선택지로 더해져요."
                maxLength={PROPOSAL_MOOD_OPTION_MAX_LENGTH + 2}
                onChange={(event) => changeMoodDraft(event.target.value)}
                onCompositionEnd={handleMoodCompositionEnd}
                onKeyDown={handleMoodKeyDown}
                placeholder="예: 초보 환영, 끝나고 커피 한 잔"
                ref={moodInputRef}
                value={moodDraft}
              />
              <Button
                data-ph-capture-attribute-action="proposal_create_mood_add"
                disabled={!moodDraft.trim()}
                onClick={() => commitMoodDraft()}
                size="sm"
                variant="secondary"
              >
                <Plus aria-hidden="true" size={15} />
                더하기
              </Button>
            </div>
          ) : null}
          {moodError ? (
            <p className="ui-field__error" role="alert">
              {moodError}
            </p>
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
