import { useCallback } from "react";
import { useNavigate } from "react-router";

import { storeReturnTarget, useAuth } from "../../auth";
import { RHYTHM_CHALLENGE_PATH } from "./availability.js";

// 공식 도전은 회원 전용이다. 로그인 전이면 회원 전용 가드가 자리 둘러보기로 보내기 전에
// 로그인(또는 가입)으로 보내고, 마치면 공식 도전으로 돌아오게 한다. 공식 도전 링크의 onClick에 붙인다.
export function useOpenChallenge() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  return useCallback(
    (event) => {
      if (status === "authenticated") return;
      event.preventDefault();
      storeReturnTarget(RHYTHM_CHALLENGE_PATH);
      if (status === "signup-required") navigate("/signup");
      else if (status === "anonymous") login();
    },
    [login, navigate, status]
  );
}
