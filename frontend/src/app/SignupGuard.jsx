import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router";

import { consumeReturnTarget, useAuth } from "../features/auth";
import { Button, ErrorState, Skeleton } from "../shared/ui";
import { resolveSignupAccess } from "./routeAccess";

export function SignupGuard({ children }) {
  const { retry, status } = useAuth();
  const redirectStarted = useRef(false);
  const [redirectTarget, setRedirectTarget] = useState(null);

  useEffect(() => {
    if (status === "authenticated" && !redirectStarted.current) {
      redirectStarted.current = true;
      setRedirectTarget(consumeReturnTarget("/my"));
    }
  }, [status]);

  if (status === "authenticated") {
    if (redirectTarget) {
      return <Navigate replace to={redirectTarget} />;
    }

    return (
      <div className="route-loading">
        <Skeleton aria-label="이동 경로 확인 중" />
      </div>
    );
  }

  if (status === "loading") {
    return children;
  }

  const decision = resolveSignupAccess(status, null);

  if (decision.kind === "unavailable") {
    return (
      <ErrorState
        action={<Button onClick={() => void retry()}>다시 시도</Button>}
        description="가입 세션을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요."
        title="가입 상태를 확인할 수 없어요"
      />
    );
  }

  if (decision.kind === "redirect") {
    return <Navigate replace state={decision.state} to={decision.to} />;
  }

  return children;
}
