import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { useAuth } from "../../features/auth/index.js";
import { memberSignupFormSchema, useSignupMember } from "../../features/member/index.js";
import { Button, ErrorState, Select, Skeleton, TextField } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";

export function SignupPage() {
  const { login, reload, status } = useAuth();
  const signupMutation = useSignupMember();
  const [submitError, setSubmitError] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register
  } = useForm({
    defaultValues: { course: "FRONTEND", crewName: "", generation: 1 },
    resolver: zodResolver(memberSignupFormSchema)
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError("");
    try {
      await signupMutation.mutateAsync(values);
      await reload();
    } catch (error) {
      const safeMessage =
        error?.status === 409
          ? error.userMessage || "이미 가입했거나 같은 크루 정보가 사용 중이에요."
          : "가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
      setSubmitError(safeMessage);
    }
  });

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
    <AccountLayout
      compact
      eyebrow="마지막 한 단계"
      title="자리하나에서 사용할 정보를 알려 주세요"
      description="GitHub 프로필과 별개로 모임에서 서로를 알아볼 수 있는 정보예요."
    >
      <form className="signup-form" noValidate onSubmit={onSubmit}>
        {submitError ? (
          <p className="form-alert" role="alert" tabIndex="-1">
            {submitError}
          </p>
        ) : null}
        <TextField
          autoComplete="nickname"
          description="완성형 한글 2~4자로 입력해 주세요."
          error={errors.crewName?.message}
          label="크루 이름"
          {...register("crewName")}
        />
        <TextField
          error={errors.generation?.message}
          inputMode="numeric"
          label="기수"
          min="1"
          type="number"
          {...register("generation")}
        />
        <Select error={errors.course?.message} label="과정" {...register("course")}>
          <option value="FRONTEND">프론트엔드</option>
          <option value="BACKEND">백엔드</option>
          <option value="ANDROID">안드로이드</option>
        </Select>
        <Button pending={isSubmitting || signupMutation.isPending} size="large" type="submit">
          가입 완료하기
        </Button>
      </form>
    </AccountLayout>
  );
}
