import { useLocation, useNavigate } from "react-router";

import { storeReturnTarget, useAuth } from "../../features/auth/index.js";

/**
 * 자유게시판 화면이 함께 쓰는 로그인 상태다. 비로그인 회원이 응답이나 작성을 누르면
 * 돌아올 경로를 저장하고 기존 로그인, 가입 흐름으로 보낸다.
 */
export function useProposalViewer() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = auth.status === "authenticated" || Boolean(auth.isAuthenticated);
  const viewerKey = isAuthenticated ? auth.member?.id ?? "authenticated" : auth.status;

  function openLogin(target = `${location.pathname}${location.search}`) {
    storeReturnTarget(target);
    if (auth.status === "signup-required") {
      navigate("/signup");
      return;
    }
    auth.login?.();
  }

  return { isAuthenticated, openLogin, status: auth.status, viewerKey };
}
