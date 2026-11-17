import { useCallback } from "react";
import { useNavigate } from "react-router";

import { storeReturnTarget, useAuth } from "../../../auth";
import { readOffset } from "../calibration.mjs";
import { browserStorage } from "../lesson.mjs";
import { readKeymap, readPracticeSettings } from "../preferences.mjs";
import { RHYTHM_BATTLE_PATH } from "../availability.js";

// 대전에서 쓰는 개인 설정이다. 랭킹 도전과 같은 저장값(키 배치, 입력 지연 보정, 음량, 표시)을 그대로 쓴다.
export function readBattleSettings() {
  const storage = browserStorage();
  const practice = readPracticeSettings(storage);
  return {
    keymap: readKeymap(storage),
    offset: readOffset(storage),
    volume: practice?.volume ?? 65,
    timingFeedback: practice?.timingFeedback ?? true,
    labels: practice?.labels ?? true,
    scrollSpeed: practice?.rate ?? 1
  };
}

// 온라인 매칭은 회원 전용이다. 로그인 전이면 로그인(또는 가입)으로 보내고, 마치면 대기실로 돌아오게 한다.
export function useOpenBattle() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  return useCallback(
    (event) => {
      if (status === "authenticated") return;
      event.preventDefault();
      storeReturnTarget(RHYTHM_BATTLE_PATH);
      if (status === "signup-required") navigate("/signup");
      else if (status === "anonymous") login();
    },
    [login, navigate, status]
  );
}
