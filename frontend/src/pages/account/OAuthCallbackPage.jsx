import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { consumeReturnTarget, useAuth } from "../../features/auth/index.js";
import { Button, ErrorState, Skeleton } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";

export function OAuthCallbackPage() {
  const { status, login, reload } = useAuth();
  const navigate = useNavigate();
  const reloaded = useRef(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (reloaded.current) return;
    reloaded.current = true;
    let active = true;

    reload()
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    if (checking || status === "loading") return;
    if (status === "authenticated") navigate(consumeReturnTarget("/my"), { replace: true });
    if (status === "signup-required") navigate("/signup", { replace: true });
  }, [checking, navigate, status]);

  if (
    checking ||
    status === "loading" ||
    status === "authenticated" ||
    status === "signup-required"
  ) {
    return (
      <AccountLayout
        compact
        eyebrow="GitHub 로그인"
        title="자리를 확인하고 있어요"
        description="브라우저의 안전한 로그인 쿠키로 회원 상태를 다시 확인합니다."
      >
        <div aria-label="로그인 확인 중" className="callback-loading" role="status">
          <Skeleton className="callback-loading__bar" />
          <p>잠시만 기다려 주세요.</p>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout compact eyebrow="GitHub 로그인" title="로그인을 마치지 못했어요">
      <ErrorState
        title="회원 정보를 확인할 수 없어요"
        description="로그인 세션이 만료되었거나 네트워크 연결이 끊겼을 수 있어요."
        action={<Button onClick={login}>다시 로그인</Button>}
      />
    </AccountLayout>
  );
}
