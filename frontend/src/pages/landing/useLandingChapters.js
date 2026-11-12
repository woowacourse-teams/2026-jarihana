import { useEffect } from "react";

function distanceFromCenter(element, center) {
  const box = element.getBoundingClientRect();
  return Math.abs(box.top + box.height / 2 - center);
}

// 화면 가운데에 가장 가까운 장을 활성 장으로 알린다. 휠과 터치는 가로채지 않고 브라우저 스크롤을 그대로 둔다.
export function useLandingChapters(rootRef, setActiveChapter) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const chapters = [...root.querySelectorAll("[data-guide-chapter]")];
    if (!chapters.length) return undefined;

    const visible = new Set();
    const inset = Math.round(window.innerHeight * 0.35);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        const center = window.innerHeight / 2;
        const nearest = [...visible].sort(
          (first, second) => distanceFromCenter(first, center) - distanceFromCenter(second, center)
        )[0];
        if (nearest) setActiveChapter(nearest.dataset.guideChapter);
      },
      { rootMargin: `-${inset}px 0px -${inset}px 0px`, threshold: [0, 0.35, 0.7] }
    );
    chapters.forEach((chapter) => observer.observe(chapter));
    return () => observer.disconnect();
  }, [rootRef, setActiveChapter]);
}
