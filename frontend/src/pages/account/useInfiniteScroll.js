import { useEffect, useRef } from "react";

/**
 * 목록 끝에 둔 감시 요소가 화면에 들어오면 다음 페이지를 불러온다.
 *
 * onLoadMore는 매 렌더마다 새 함수로 올 수 있어 ref로 흘려보낸다. 관찰을 다시
 * 걸어야 하는 조건은 hasNext와 pending뿐이다.
 */
export function useInfiniteScroll({ hasNext, onLoadMore, pending, rootMargin = "240px" }) {
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
      { rootMargin }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, pending, rootMargin]);

  return sentinelRef;
}
