import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  BOOTCAMP_STATUS_LABELS,
  CAREER_LABELS,
  MEMBER_FIELD_LABELS
} from "../../entities/member/index.js";
import { consumeReturnTarget, useAuth } from "../../features/auth/index.js";
import {
  CUSTOM_BOOTCAMP,
  WOOTECO_BOOTCAMP,
  memberSignupFormSchema,
  resolveBootcampName,
  useSignupMember
} from "../../features/member/index.js";
import profileAvatar from "../../shared/assets/brand/jarihana-favicon.png";
import signupBootcamp from "../../shared/assets/illustrations/signup-expansion/signup-bootcamp.webp";
import signupCompany from "../../shared/assets/illustrations/signup-expansion/signup-company.webp";
import { Button, Checkbox, ErrorState, Modal, Select, Skeleton, TextField } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";

const FIRST_COHORT_YEAR = 2018;
const currentGeneration = Math.max(new Date().getFullYear() - FIRST_COHORT_YEAR, 1);
const generationOptions = Array.from({ length: currentGeneration }, (_, index) => index + 1);

const SIGNUP_TYPE_OPTIONS = [
  { description: "우아한테크코스 포함", imageUrl: signupBootcamp, label: "부트캠프", value: "BOOTCAMP" },
  { description: "IT 회사 재직", imageUrl: signupCompany, label: "회사", value: "PROFESSIONAL" }
];

const BOOTCAMP_OPTIONS = [
  WOOTECO_BOOTCAMP,
  "부스트캠프",
  "SSAFY",
  "항해99",
  "42서울",
  "코드스테이츠",
  "이어드림스쿨",
  "멋쟁이사자처럼",
  "패스트캠퍼스"
];

const STATUS_DESCRIPTIONS = {
  IN_PROGRESS: "지금 과정을 듣고 있어요",
  COMPLETED: "과정을 마쳤어요. 취업을 준비하고 있어도 여기를 골라 주세요"
};

/** 첫 화면에서 고른 유형별 단계다. 우아한테크코스를 고르고 크루 인증을 누르면 CREW 단계로 바뀐다. */
const STEPS = {
  BOOTCAMP: ["type", "camp", "status", "field", "name"],
  CREW: ["type", "camp", "crew"],
  PROFESSIONAL: ["type", "job", "career", "name"]
};

const STEP_QUESTIONS = {
  camp: "어느 부트캠프인가요?",
  career: "몇 년 차인가요?",
  crew: "안녕하세요 크루님 프로필을 작성해주세요",
  field: "어떤 분야를 공부하고 있나요?",
  job: "어떤 일을 하고 있나요?",
  name: "자리하나에서 쓸 닉네임을 알려주세요",
  status: "지금은 어떤 상태인가요?"
};

/** 단계별로 보여 줄 입력 오류다. 아직 입력하지 않은 다음 단계의 오류는 숨긴다. */
const STEP_FIELDS = {
  camp: ["bootcampName", "bootcampCustomName", "bootcampCohort"],
  crew: ["crewName", "course", "generation"],
  name: ["crewName", "companyName"]
};

/** 고정 헤더 아래에서 단계 상단이 가려졌다고 보는 기준(px)이다. */
const STEP_TOP_MARGIN = 80;

const EMPTY_VALUES = {
  bootcampCohort: "",
  bootcampCustomName: "",
  bootcampName: "",
  bootcampStatus: "",
  career: "",
  companyName: "",
  companyVisible: false,
  course: "",
  crewName: "",
  field: "",
  generation: "",
  memberType: ""
};

function fieldErrors(error, fields) {
  const errors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (fields.includes(field) && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

function WootecoLogo() {
  return (
    <svg aria-hidden="true" className="signup-wooteco-logo" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10.94" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx="12" cy="12" r="7.59" fill="currentColor" />
      <circle cx="4.74" cy="3.35" r="3.11" fill="currentColor" />
      <circle cx="19.26" cy="20.65" r="3.11" fill="currentColor" />
    </svg>
  );
}

function ChoiceButton({ action, checked, children, description, onSelect }) {
  return (
    <button
      aria-checked={checked}
      className={`signup-choice${description ? "" : " signup-choice--compact"}`}
      data-ph-capture-attribute-action={action}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span className="signup-choice__copy">
        <strong>{children}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {description ? <ChevronRight aria-hidden="true" className="signup-choice__chevron" size={18} /> : null}
    </button>
  );
}

export function SignupPage() {
  const { avatarUrl, login, status } = useAuth();
  const signupMutation = useSignupMember();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const questionRef = useRef(null);
  const formRef = useRef(null);
  const previousStepRef = useRef(null);

  const steps = STEPS[values.memberType] ?? ["type"];
  const step = steps[stepIndex] ?? "type";
  const isWootecoSelected = values.bootcampName === WOOTECO_BOOTCAMP;

  useEffect(() => {
    if (previousStepRef.current !== null && previousStepRef.current !== step) {
      questionRef.current?.focus({ preventScroll: true });
      // 이전 단계에서 내려간 화면이면 새 단계의 진행 막대와 이전 버튼이 보이도록 맨 위로 올린다.
      const formTop = formRef.current?.getBoundingClientRect().top ?? 0;
      if (window.scrollY > 0 && formTop < STEP_TOP_MARGIN) window.scrollTo({ top: 0 });
    }
    previousStepRef.current = step;
  }, [step]);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError("");
  }

  function goTo(nextIndex) {
    setErrors({});
    setSubmitError("");
    setStepIndex(nextIndex);
  }

  function selectType(memberType) {
    setValues((current) => (current.memberType === memberType ? current : { ...EMPTY_VALUES, crewName: current.crewName, memberType }));
    goTo(1);
  }

  function selectAndContinue(field, value) {
    update(field, value);
    goTo(stepIndex + 1);
  }

  function selectBootcamp(bootcampName) {
    setValues((current) => ({ ...current, bootcampName, bootcampCustomName: bootcampName === CUSTOM_BOOTCAMP ? current.bootcampCustomName : "" }));
    setErrors({});
  }

  function startCrewVerification() {
    // 인증 방법이 정해지기 전까지는 크루 인증 버튼이 지금과 같은 크루 프로필 입력으로 바로 이어진다.
    setValues((current) => ({ ...current, memberType: "CREW" }));
    goTo(STEPS.CREW.indexOf("crew"));
  }

  function goBack() {
    if (step === "crew") setValues((current) => ({ ...current, memberType: "BOOTCAMP" }));
    goTo(Math.max(stepIndex - 1, 0));
  }

  function validateStep(fields) {
    const result = memberSignupFormSchema.safeParse(values);
    if (result.success) return { data: result.data, errors: {} };
    return { data: null, errors: fieldErrors(result.error, fields) };
  }

  function continueFromCamp() {
    const { errors: campErrors } = validateStep(STEP_FIELDS.camp);
    if (Object.keys(campErrors).length > 0) {
      setErrors(campErrors);
      return;
    }
    goTo(stepIndex + 1);
  }

  function submitProfile() {
    const result = memberSignupFormSchema.safeParse(values);
    if (!result.success) {
      const visibleErrors = fieldErrors(result.error, STEP_FIELDS[step] ?? []);
      setErrors(visibleErrors);
      if (Object.keys(visibleErrors).length === 0) setSubmitError("앞 단계에서 빠진 항목이 있어요. 이전 단계를 확인해 주세요.");
      return;
    }
    setPendingValues(result.data);
    setSubmitError("");
    setConfirmationOpen(true);
  }

  function handleStepSubmit(event) {
    event.preventDefault();
    if (step === "camp") {
      if (!isWootecoSelected) continueFromCamp();
      return;
    }
    if (step === "name" || step === "crew") submitProfile();
  }

  function closeConfirmation(force = false) {
    if (!force && signupMutation.isPending) return;
    setConfirmationOpen(false);
    setPendingValues(null);
  }

  async function confirmSignup() {
    if (!pendingValues || signupMutation.isPending) return;
    try {
      await signupMutation.mutateAsync(pendingValues);
    } catch (error) {
      const safeMessage =
        error?.status === 409
          ? error.userMessage || "이미 가입했거나 같은 닉네임이 사용 중이에요."
          : "가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
      setSubmitError(safeMessage);
      closeConfirmation(true);
      return;
    }
    const returnTarget = consumeReturnTarget("/my");
    const invitationReturn = returnTarget.startsWith("/invitations/") || returnTarget.startsWith("/notifications/open/");
    window.location.replace(invitationReturn ? returnTarget : "/my");
  }

  if (status === "loading") {
    return (
      <AccountLayout compact title="가입 정보를 확인하고 있어요">
        <Skeleton className="profile-skeleton" />
      </AccountLayout>
    );
  }

  if (status === "anonymous") {
    return (
      <AccountLayout compact eyebrow="가입 세션 만료" title="로그인이 다시 필요해요">
        <ErrorState
          title="가입 정보를 안전하게 확인할 수 없어요"
          description="GitHub 로그인 세션을 다시 만든 뒤 가입을 이어가 주세요."
          action={<Button onClick={login}>GitHub로 다시 로그인</Button>}
        />
      </AccountLayout>
    );
  }

  const avatar = (
    <img
      alt="GitHub 프로필 이미지"
      className="signup-step__avatar"
      onError={() => setAvatarLoadFailed(true)}
      src={avatarLoadFailed ? profileAvatar : avatarUrl || profileAvatar}
    />
  );

  const alert = submitError ? (
    <p className="form-alert" role="alert" tabIndex="-1">
      {submitError}
    </p>
  ) : null;

  const submitButton = (
    <Button
      className="signup-form__submit signup-step__submit"
      data-ph-capture-attribute-action="signup_submit"
      pending={signupMutation.isPending}
      size="sm"
      type="submit"
    >
      가입 완료하기
    </Button>
  );

  function renderStep() {
    if (step === "camp") {
      return (
        <>
          <div aria-label="부트캠프" className="signup-step__chips" role="radiogroup">
            {[...BOOTCAMP_OPTIONS, CUSTOM_BOOTCAMP].map((option) => (
              <button
                aria-checked={values.bootcampName === option}
                className="signup-chip"
                data-ph-capture-attribute-action="signup_bootcamp_select"
                key={option}
                onClick={() => selectBootcamp(option)}
                role="radio"
                type="button"
              >
                {option === WOOTECO_BOOTCAMP ? <WootecoLogo /> : null}
                <span>{option === CUSTOM_BOOTCAMP ? "직접 입력" : option}</span>
              </button>
            ))}
          </div>
          {errors.bootcampName ? <p className="ui-field__error">{errors.bootcampName}</p> : null}
          {isWootecoSelected ? (
            <div className="signup-verify">
              <p>
                <strong>우아한테크코스 크루</strong>는 크루 인증 후 과정과 기수를 입력해 가입해요.
              </p>
              <button
                className="signup-verify__button"
                data-ph-capture-attribute-action="signup_crew_verification_start"
                onClick={startCrewVerification}
                type="button"
              >
                <WootecoLogo />
                <span>우테코 크루 인증</span>
              </button>
            </div>
          ) : (
            <>
              {values.bootcampName === CUSTOM_BOOTCAMP ? (
                <TextField
                  autoComplete="off"
                  data-ph-capture-attribute-action="signup_bootcamp_name_input"
                  error={errors.bootcampCustomName}
                  label="부트캠프 이름"
                  onChange={(event) => update("bootcampCustomName", event.target.value)}
                  placeholder="예: 우리동네 개발캠프"
                  value={values.bootcampCustomName}
                />
              ) : null}
              <TextField
                autoComplete="off"
                data-ph-capture-attribute-action="signup_bootcamp_cohort_input"
                description="선택 입력이에요"
                error={errors.bootcampCohort}
                label="기수"
                onChange={(event) => update("bootcampCohort", event.target.value)}
                placeholder="예: 9기"
                value={values.bootcampCohort}
              />
              <div className="signup-step__foot">
                <Button data-ph-capture-attribute-action="signup_step_next" size="sm" type="submit">
                  다음
                </Button>
              </div>
            </>
          )}
        </>
      );
    }

    if (step === "status") {
      return (
        <div aria-label="수강 상태" className="signup-step__rows" role="radiogroup">
          {Object.entries(BOOTCAMP_STATUS_LABELS).map(([value, label]) => (
            <ChoiceButton
              action="signup_bootcamp_status_select"
              checked={values.bootcampStatus === value}
              description={STATUS_DESCRIPTIONS[value]}
              key={value}
              onSelect={() => selectAndContinue("bootcampStatus", value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </div>
      );
    }

    if (step === "field" || step === "job") {
      return (
        <div aria-label={step === "field" ? "분야" : "직무"} className="signup-step__grid" role="radiogroup">
          {Object.entries(MEMBER_FIELD_LABELS).map(([value, label]) => (
            <ChoiceButton
              action={step === "field" ? "signup_field_select" : "signup_job_select"}
              checked={values.field === value}
              key={value}
              onSelect={() => selectAndContinue("field", value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </div>
      );
    }

    if (step === "career") {
      return (
        <div aria-label="연차" className="signup-step__grid" role="radiogroup">
          {Object.entries(CAREER_LABELS).map(([value, label]) => (
            <ChoiceButton
              action="signup_career_select"
              checked={values.career === value}
              key={value}
              onSelect={() => selectAndContinue("career", value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </div>
      );
    }

    if (step === "crew") {
      return (
        <>
          <div className="signup-step__panel">
            {avatar}
            {alert}
            <TextField
              aria-label="크루 이름"
              autoComplete="nickname"
              className="signup-form__name-input"
              data-ph-capture-attribute-action="signup_name_input"
              error={errors.crewName}
              label={null}
              onChange={(event) => update("crewName", event.target.value)}
              placeholder="닉네임 2~4글자"
              value={values.crewName}
            />
            <div className="signup-form__selects">
              <Select
                aria-label="과정"
                data-ph-capture-attribute-action="signup_course_select"
                error={errors.course}
                label={null}
                onChange={(event) => update("course", event.target.value)}
                required
                value={values.course}
              >
                <option disabled value="">
                  과정
                </option>
                <option value="FRONTEND">프론트엔드</option>
                <option value="BACKEND">백엔드</option>
                <option value="ANDROID">안드로이드</option>
              </Select>
              <Select
                aria-label="기수"
                data-ph-capture-attribute-action="signup_generation_select"
                error={errors.generation}
                label={null}
                onChange={(event) => update("generation", event.target.value)}
                required
                value={values.generation}
              >
                <option disabled value="">
                  기수
                </option>
                {generationOptions.map((generation) => (
                  <option key={generation} value={generation}>
                    {generation}기
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {submitButton}
        </>
      );
    }

    return (
      <>
        <div className="signup-step__panel">
          {avatar}
          {alert}
          <TextField
            aria-label="닉네임"
            autoComplete="nickname"
            className="signup-form__name-input"
            data-ph-capture-attribute-action="signup_name_input"
            error={errors.crewName}
            label={null}
            onChange={(event) => update("crewName", event.target.value)}
            placeholder="닉네임 2~4글자"
            value={values.crewName}
          />
          {values.memberType === "PROFESSIONAL" ? (
            <div className="signup-step__company">
              <TextField
                autoComplete="organization"
                data-ph-capture-attribute-action="signup_company_input"
                description="선택 입력이에요"
                error={errors.companyName}
                label="회사명"
                onChange={(event) => update("companyName", event.target.value)}
                placeholder="예: 자리하나"
                value={values.companyName}
              />
              <Checkbox
                checked={values.companyVisible}
                data-ph-capture-attribute-action="signup_company_public_toggle"
                disabled={!values.companyName.trim()}
                label="참여자 목록에 회사명 보이기"
                onChange={(event) => update("companyVisible", event.target.checked)}
              />
            </div>
          ) : null}
        </div>
        {submitButton}
      </>
    );
  }

  function trail() {
    const answers = [];
    if (stepIndex > 0) answers.push(SIGNUP_TYPE_OPTIONS.find((option) => option.value === (values.memberType === "CREW" ? "BOOTCAMP" : values.memberType))?.label);
    for (const passed of steps.slice(1, stepIndex)) {
      if (passed === "camp") {
        answers.push(values.memberType === "CREW" ? "우테코 크루 인증" : [resolveBootcampName(values), values.bootcampCohort.trim()].filter(Boolean).join(" "));
      }
      if (passed === "status") answers.push(BOOTCAMP_STATUS_LABELS[values.bootcampStatus]);
      if (passed === "field" || passed === "job") answers.push(MEMBER_FIELD_LABELS[values.field]);
      if (passed === "career") answers.push(CAREER_LABELS[values.career]);
    }
    return answers.filter(Boolean);
  }

  return (
    <AccountLayout compact title={step === "type" ? null : "프로필 입력"}>
      {step === "type" ? (
        <div className="signup-form">
          <p aria-live="polite" className="signup-form__prompt">
            안녕하세요. 어떤 분이신가요?
          </p>
          <div className="signup-form__layout">
            <fieldset aria-label="가입 유형" className="signup-type-step">
              <div aria-label="가입 유형" className="signup-type-options" role="radiogroup">
                {SIGNUP_TYPE_OPTIONS.map(({ description, imageUrl, label, value }) => (
                  <button
                    aria-checked={values.memberType === value || (value === "BOOTCAMP" && values.memberType === "CREW")}
                    className="signup-type-option"
                    data-ph-capture-attribute-action="signup_member_type_select"
                    key={value}
                    onClick={() => selectType(value)}
                    role="radio"
                    type="button"
                  >
                    <span className="signup-type-option__image-frame">
                      <img
                        alt=""
                        aria-hidden="true"
                        className="signup-type-option__image"
                        decoding="async"
                        height="128"
                        src={imageUrl}
                        width="128"
                      />
                    </span>
                    <span className="signup-type-option__label">{label}</span>
                    <span className="signup-type-option__description">{description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      ) : (
        <form className="signup-form signup-flow" noValidate onSubmit={handleStepSubmit} ref={formRef}>
          <div className="signup-flow__top">
            <button
              className="signup-flow__back"
              data-ph-capture-attribute-action="signup_step_back"
              onClick={goBack}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={20} />
              <span>이전</span>
            </button>
            <div aria-hidden="true" className="signup-flow__progress">
              {steps.map((name, index) => (
                <span className={index <= stepIndex ? "is-done" : undefined} key={name} />
              ))}
            </div>
            <span className="signup-flow__count">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>
          <ul aria-label="지금까지 고른 답" className="signup-flow__trail">
            {trail().map((answer, index) => (
              <li key={`${index}-${answer}`}>
                <Check aria-hidden="true" size={12} />
                {answer}
              </li>
            ))}
          </ul>
          <section className="signup-step" key={step}>
            <h2 className="signup-step__question" ref={questionRef} tabIndex="-1">
              {STEP_QUESTIONS[step]}
            </h2>
            {renderStep()}
          </section>
        </form>
      )}
      <Modal
        closeAction="signup_confirmation_dismiss"
        description={
          <>
            입력한 정보는 가입 후 직접 변경할 수 없어요.
            <br />
            잘못 입력한 경우 관리자에게 문의해 주세요.
          </>
        }
        onClose={closeConfirmation}
        open={confirmationOpen}
        title="입력 정보를 확인해 주세요"
      >
        <div className="ui-dialog__actions signup-confirm-actions">
          <Button
            data-ph-capture-attribute-action="signup_confirmation_dismiss"
            onClick={closeConfirmation}
            size="sm"
            variant="secondary"
          >
            취소
          </Button>
          <Button
            data-ph-capture-attribute-action="signup_confirm"
            onClick={confirmSignup}
            pending={signupMutation.isPending}
            size="sm"
          >
            확인
          </Button>
        </div>
      </Modal>
    </AccountLayout>
  );
}
