import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { useAuth } from "../../features/auth/index.js";
import { memberSignupFormSchema, useSignupMember } from "../../features/member/index.js";
import profileAvatar from "../../shared/assets/brand/jarihana-favicon.png";
import { Button, ErrorState, Modal, Select, Skeleton, TextField } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";

const FIRST_COHORT_YEAR = 2018;
const currentGeneration = Math.max(new Date().getFullYear() - FIRST_COHORT_YEAR, 1);
const generationOptions = Array.from({ length: currentGeneration }, (_, index) => index + 1);

export function SignupPage() {
  const { avatarUrl, login, status } = useAuth();
  const signupMutation = useSignupMember();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue
  } = useForm({
    defaultValues: { course: "", crewName: "", generation: "", memberType: "" },
    resolver: zodResolver(memberSignupFormSchema),
    shouldUnregister: true
  });
  const selectedMemberType = useWatch({ control, name: "memberType" });

  const onSubmit = handleSubmit((values) => {
    setPendingValues(values);
    openConfirmation();
  });

  function openConfirmation() {
    setSubmitError("");
    setConfirmationOpen(true);
  }

  function changeMemberType() {
    setValue("memberType", "", { shouldDirty: true, shouldValidate: false });
    setValue("course", "", { shouldDirty: true, shouldValidate: false });
    setValue("generation", "", { shouldDirty: true, shouldValidate: false });
    setSubmitError("");
  }

  function selectMemberType(memberType) {
    setValue("memberType", memberType, { shouldDirty: true, shouldValidate: false });
    setSubmitError("");
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
          ? error.userMessage || "이미 가입했거나 같은 크루 정보가 사용 중이에요."
          : "가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
      setSubmitError(safeMessage);
      closeConfirmation(true);
      return;
    }
    window.location.replace("/my");
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

  return (
    <AccountLayout compact title={selectedMemberType ? "프로필 입력" : "가입 유형 선택"}>
      <form className="signup-form" noValidate onSubmit={onSubmit}>
        {!selectedMemberType ? (
          <fieldset aria-label="가입 유형" className="signup-type-step">
            <div aria-label="가입 유형" className="signup-type-options" role="radiogroup">
              <button
                aria-checked={selectedMemberType === "CREW"}
                className="signup-type-option"
                onClick={() => selectMemberType("CREW")}
                role="radio"
                type="button"
              >
                크루
              </button>
              <button
                aria-checked={selectedMemberType === "COACH"}
                className="signup-type-option"
                onClick={() => selectMemberType("COACH")}
                role="radio"
                type="button"
              >
                코치
              </button>
            </div>
            {errors.memberType?.message ? <p className="ui-field__error">{errors.memberType.message}</p> : null}
          </fieldset>
        ) : null}
        {selectedMemberType ? (
          <>
            <div className="signup-form__profile-heading">
              <p className="account-eyebrow">나의 프로필</p>
            </div>
            <img
              alt="GitHub 프로필 이미지"
              className="signup-form__avatar"
              onError={() => setAvatarLoadFailed(true)}
              src={avatarLoadFailed ? profileAvatar : avatarUrl || profileAvatar}
            />
            {submitError ? (
              <p className="form-alert" role="alert" tabIndex="-1">
                {submitError}
              </p>
            ) : null}
            <TextField
              aria-label="크루 이름"
              autoComplete="nickname"
              className="signup-form__name-input"
              error={errors.crewName?.message}
              label={null}
              placeholder="닉네임 2~4글자"
              {...register("crewName")}
            />
            {selectedMemberType === "CREW" ? (
              <div className="signup-form__selects">
                <Select aria-label="과정" error={errors.course?.message} label={null} required {...register("course")}>
                  <option disabled value="">
                    과정
                  </option>
                  <option value="FRONTEND">프론트엔드</option>
                  <option value="BACKEND">백엔드</option>
                  <option value="ANDROID">안드로이드</option>
                </Select>
                <Select
                  aria-label="기수"
                  error={errors.generation?.message}
                  label={null}
                  required
                  {...register("generation")}
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
            ) : null}
            <Button
              className="signup-form__submit"
              pending={isSubmitting || signupMutation.isPending}
              size="sm"
              type="submit"
            >
              가입 완료하기
            </Button>
            <Button className="signup-form__change-type" onClick={changeMemberType} size="sm" type="button" variant="tertiary">
              유형 변경
            </Button>
          </>
        ) : null}
      </form>
      <Modal
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
          <Button onClick={closeConfirmation} size="sm" variant="secondary">
            취소
          </Button>
          <Button onClick={confirmSignup} pending={signupMutation.isPending} size="sm">
            확인
          </Button>
        </div>
      </Modal>
    </AccountLayout>
  );
}
