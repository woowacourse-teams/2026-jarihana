import { useCallback, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router";

import { storeReturnTarget, useAuth } from "../features/auth";
import { Button, ErrorState, Skeleton } from "../shared/ui";
import { resolveAuthenticatedAccess } from "./routeAccess";

function PersistedRedirect({ currentPath, state, to }) {
  const [ready, setReady] = useState(false);
  const persisted = useRef(false);

  const persistBeforeRedirect = useCallback(
    (node) => {
      if (node && !persisted.current) {
        storeReturnTarget(currentPath);
        persisted.current = true;
        setReady(true);
      }
    },
    [currentPath]
  );

  if (!ready) {
    return (
      <div className="route-loading" ref={persistBeforeRedirect}>
        <Skeleton aria-label="이동 경로 저장 중" />
      </div>
    );
  }

  return <Navigate replace state={state} to={to} />;
}

export function AuthGuard({ children }) {
  const { retry, status } = useAuth();
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const decision = resolveAuthenticatedAccess(status, currentPath);

  if (decision.kind === "loading") {
    return (
      <div className="route-loading">
        <Skeleton aria-label="로그인 상태 확인 중" />
      </div>
    );
  }

  if (decision.kind === "unavailable") {
    return (
      <ErrorState
        action={<Button onClick={() => void retry()}>다시 시도</Button>}
        description="로그인 상태를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요."
        title="인증 서비스를 이용할 수 없어요"
      />
    );
  }

  if (decision.kind === "redirect") {
    if (decision.state.loginRequired) {
      return (
        <PersistedRedirect currentPath={currentPath} state={decision.state} to={decision.to} />
      );
    }
    return <Navigate replace state={decision.state} to={decision.to} />;
  }

  return children;
}
