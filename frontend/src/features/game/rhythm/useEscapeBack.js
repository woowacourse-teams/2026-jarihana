import { useEffect } from "react";
import { useNavigate } from "react-router";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Esc를 누르면 리듬 작살의 바로 전 단계 화면으로 돌아간다.
// 게임이 Esc를 먼저 쓴 경우(일시정지, 따라 하기 멈춤, 키 바꾸기 취소)와 열린 대화 상자, 입력 중인 칸에서는 움직이지 않는다.
export function useEscapeBack(to) {
  const navigate = useNavigate();
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat || event.isComposing)
        return;
      const target = event.target;
      if (TYPING_TAGS.has(target?.tagName) || target?.isContentEditable) return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      event.preventDefault();
      navigate(to);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, to]);
}
