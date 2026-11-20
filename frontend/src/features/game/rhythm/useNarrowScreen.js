import { useEffect, useState } from "react";

// 태블릿보다 좁은 화면(767px 이하)인지 알려 준다. 화면 폭이 바뀌면 다시 계산한다.
export const NARROW_SCREEN_QUERY = "(max-width: 767px)";

function matches() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(NARROW_SCREEN_QUERY)?.matches);
}

export function useNarrowScreen() {
  const [narrow, setNarrow] = useState(matches);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_SCREEN_QUERY);
    if (!query) return undefined;
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return narrow;
}
