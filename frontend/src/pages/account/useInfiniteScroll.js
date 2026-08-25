import { useEffect, useRef } from "react";

/**
 * 목록 끝에 둔 감시 요소가 화면에 들어오면 다음 페이지를 불러온다.
 *
 * onLoadMore는 매 렌더마다 새 함수로 올 수 있어 ref로 흘려보낸다. 관찰을 다시
 * 걸어야 하는 조건은 hasNext와 pending뿐이다.
 *
 * rootRef를 주면 그 요소의 스크롤을 기준으로 본다. 목록이 자기 컨테이너 안에서
 * 스크롤될 때 화면(viewport) 기준으로 보면 감시 요소가 영영 들어오지 않는다.
 */
export function useInfiniteScroll({ hasNext, onLoadMore, pending, rootRef, rootMargin = "160px" }) {
  const sentinelRef = useRef(null);
  const loadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNext || pending || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRef.current?.();
        }
      },
      { root: rootRef?.current ?? null, rootMargin }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, pending, rootMargin, rootRef]);

  return sentinelRef;
}
