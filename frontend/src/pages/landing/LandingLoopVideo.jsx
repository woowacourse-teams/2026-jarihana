import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// 첫 장면 이미지를 먼저 보여 주고, 화면 가까이 오면 영상을 불러와 소리 없이 반복한다.
// 동작 줄이기 설정에서는 영상을 불러오지 않고 첫 장면만 둔다.
export function LandingLoopVideo({ className = "", label, poster, src }) {
  const videoRef = useRef(null);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          video.play?.()?.catch?.(() => {});
        } else {
          video.pause?.();
        }
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (near && !reducedMotion) videoRef.current?.play?.()?.catch?.(() => {});
  }, [near, reducedMotion]);

  return (
    <video
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      autoPlay={!reducedMotion}
      className={className}
      loop
      muted
      playsInline
      poster={poster}
      preload="none"
      ref={videoRef}
      src={near && !reducedMotion ? src : undefined}
    />
  );
}
