import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Esc를 누르면 리듬 작살의 바로 전 단계 화면으로 돌아간다.
// 게임이 Esc를 먼저 쓴 경우(일시정지, 따라 하기 멈춤, 키 바꾸기 취소)와 열린 대화 상자, 입력 중인 칸에서는 움직이지 않는다.
// 경로 대신 함수를 넘기면 화면 이동 없이 한 화면 안의 이전 단계로 돌아간다.
export function useEscapeBack(to) {
  const navigate = useNavigate();
  const target = useRef(to);
  useEffect(() => {
    target.current = to;
  }, [to]);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat || event.isComposing)
        return;
      const element = event.target;
      if (TYPING_TAGS.has(element?.tagName) || element?.isContentEditable) return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      event.preventDefault();
      if (typeof target.current === "function") target.current();
      else navigate(target.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
}
