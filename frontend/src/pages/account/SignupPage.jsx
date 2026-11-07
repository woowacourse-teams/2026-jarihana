import { useState } from "react";

import { consumeReturnTarget, useAuth } from "../../features/auth/index.js";
import { memberSignupFormSchema, useSignupMember } from "../../features/member/index.js";
import profileAvatar from "../../shared/assets/brand/jarihana-favicon.png";
import { Button, ErrorState, Modal, Skeleton, TextField } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";

function fieldErrors(error) {
  const errors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/**
 * 가입은 닉네임만 받는다. 우아한테크코스 크루인지와 기수, 과정은 서버가 GitHub 계정을 크루 명단과 대조해 정한다.
 */
export function SignupPage() {
  const { avatarUrl, login, status } = useAuth();
  const signupMutation = useSignupMember();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [crewName, setCrewName] = useState("");
  const [errors, setErrors] = useState({});
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(null);
  const [submitError, setSubmitError] = useState("");

  function updateCrewName(value) {
    setCrewName(value);
    setErrors({});
    setSubmitError("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    const result = memberSignupFormSchema.safeParse({ crewName });
    if (!result.success) {
      setErrors(fieldErrors(result.error));
      return;
    }
    setPendingValues(result.data);
    setSubmitError("");
    setConfirmationOpen(true);
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
    const shouldReturn = returnTarget.startsWith("/invitations/") || returnTarget.startsWith("/notifications/open/") || returnTarget.startsWith("/games/") || returnTarget.startsWith("/sparring/");
    window.location.replace(shouldReturn ? returnTarget : "/my");
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
    <AccountLayout compact title="프로필 입력">
      <form className="signup-form signup-flow" noValidate onSubmit={handleSubmit}>
        <section className="signup-step">
          <h2 className="signup-step__question">자리하나에서 쓸 닉네임을 알려주세요</h2>
          <div className="signup-step__panel">
            <img
              alt="GitHub 프로필 이미지"
              className="signup-step__avatar"
              onError={() => setAvatarLoadFailed(true)}
              src={avatarLoadFailed ? profileAvatar : avatarUrl || profileAvatar}
            />
            {submitError ? (
              <p className="form-alert" role="alert" tabIndex="-1">
                {submitError}
              </p>
            ) : null}
            <TextField
              aria-label="닉네임"
              autoComplete="nickname"
              className="signup-form__name-input"
              data-ph-capture-attribute-action="signup_name_input"
              description="우아한테크코스 크루는 GitHub 계정으로 기수와 과정을 자동으로 확인해요."
              error={errors.crewName}
              label={null}
              onChange={(event) => updateCrewName(event.target.value)}
              placeholder="닉네임 2~4글자"
              value={crewName}
            />
          </div>
          <Button
            className="signup-form__submit signup-step__submit"
            data-ph-capture-attribute-action="signup_submit"
            pending={signupMutation.isPending}
            size="sm"
            type="submit"
          >
            가입 완료하기
          </Button>
        </section>
      </form>
      <Modal
        closeAction="signup_confirmation_dismiss"
        description={
          <>
            닉네임은 가입 후 직접 변경할 수 없어요.
            <br />
            잘못 입력한 경우 관리자에게 문의해 주세요.
          </>
        }
        onClose={closeConfirmation}
        open={confirmationOpen}
        title="닉네임을 확인해 주세요"
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
