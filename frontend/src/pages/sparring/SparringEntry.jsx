import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import "./sparring-entry.css";

const sides = ["MINT", "CORAL"];
export const ENTRY_REVEAL_DURATION = 1240;

export function SparringEntry({
  topic = null,
  busy = false,
  waiting = false,
  error = null,
  leaving = false,
  onStart,
  onWatch,
  onRetry
}) {
  const fitRef = useRef(null);
  const compositionRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [now, setNow] = useState(Date.now);
  const selected = draft ?? topic?.mySide ?? null;
  const deadline = topic?.closesAt ? Date.parse(topic.closesAt) : null;
  const closed = deadline !== null && deadline <= now;
  const locked = busy || waiting || leaving;

  useEffect(() => {
    if (deadline === null || !Number.isFinite(deadline) || closed) return undefined;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, deadline - Date.now()), 2147483647)
    );
    return () => clearTimeout(timer);
  }, [closed, deadline, now]);

  useLayoutEffect(() => {
    const fit = fitRef.current;
    const composition = compositionRef.current;
    const resize = () => {
      if (!fit.clientHeight || !composition.offsetHeight) return;
      const scale = Math.min(1, fit.clientHeight / composition.offsetHeight);
      composition.style.setProperty("--entry-scale", String(scale));
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(fit);
    observer?.observe(composition);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const startLabel = busy
    ? "내 편을 정하고 있어요"
    : waiting
      ? "경기장을 준비하고 있어요"
      : selected
        ? "이 편으로 시작"
        : "내 편을 골라주세요";

  return (
    <section
      className="sparring-entry"
      data-side={selected || undefined}
      data-leaving={leaving}
      style={{ "--entry-reveal-duration": `${ENTRY_REVEAL_DURATION}ms` }}
      aria-label="토론 입장"
      aria-busy={!topic && !error}
      inert={leaving}
    >
      <div className="sparring-entry__panel sparring-entry__panel--mint" aria-hidden="true" />
      <div className="sparring-entry__panel sparring-entry__panel--coral" aria-hidden="true" />
      <div className="sparring-entry__brush" aria-hidden="true" />
      <div className="sparring-entry__seam" aria-hidden="true" />
      <svg className="sparring-entry__charge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="charge-glow" d="M58 0 56 17 58 21 52 38 54 43 48 58 50 63 44 81 46 85 42 100" />
        <path className="charge-core" d="M58 0 56 17 58 21 52 38 54 43 48 58 50 63 44 81 46 85 42 100" />
      </svg>
      <Link
        className="sparring-entry__back"
        to="/sparring"
        aria-label="토론 목록으로"
        data-ph-capture-attribute-action="sparring_back"
      >
        <ArrowLeft size={24} aria-hidden="true" />
      </Link>
      <div className="sparring-entry__fit" ref={fitRef}>
        <div className="sparring-entry__composition" ref={compositionRef}>
          <header className="sparring-entry__heading">
            <p className="sparring-entry__kicker">{closed ? "어떤 이야기가 오갔을까?" : "오늘은 어느 편?"}</p>
            <h1>{topic?.title || "토론을 불러오고 있어요"}</h1>
          </header>
          <div className="sparring-entry__matchup" role="group" aria-label="내 편 고르기">
            {sides.map(side => {
              const label = side === "MINT" ? topic?.a : topic?.b;
              const active = selected === side;
              return (
                <button
                  key={side}
                  type="button"
                  className="sparring-entry__choice"
                  data-side={side}
                  aria-label={label ? `${label} 편 선택` : `${side === "MINT" ? "민트" : "코랄"} 편 불러오는 중`}
                  aria-pressed={active}
                  disabled={!topic || closed || locked}
                  onClick={() => setDraft(side)}
                  data-ph-capture-attribute-action="sparring_entry_side_select"
                >
                  <span className="sparring-entry__label">{label || "잠시만요"}</span>
                  <span className="sparring-entry__portrait-space" aria-hidden="true">
                    <span className="sparring-entry__portrait" style={{ backgroundImage: "url(/sparring-arena/assets/entry-rivals.webp)" }} />
                  </span>
                  <span className="sparring-entry__select">
                    {active && <Check size={17} aria-hidden="true" />}
                    {closed ? "마감된 토론" : active ? "내 편" : "이 편 선택"}
                  </span>
                </button>
              );
            })}
            <span className="sparring-entry__vs" aria-hidden="true">VS</span>
          </div>
          <div className="sparring-entry__actions">
            {error && (
              <div className="sparring-entry__error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="sparring-entry__button"
                  onClick={onRetry}
                  disabled={busy || leaving}
                  data-ph-capture-attribute-action="sparring_room_retry"
                >다시 불러오기</button>
              </div>
            )}
            {!closed && (
              <button
                type="button"
                className="sparring-entry__button sparring-entry__start"
                disabled={!topic || !selected || locked}
                onClick={() => onStart(selected)}
                data-ph-capture-attribute-action="sparring_entry_start"
              >
                {startLabel}<ArrowRight size={19} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="sparring-entry__button sparring-entry__watch"
              disabled={!topic || locked}
              onClick={onWatch}
              data-ph-capture-attribute-action="sparring_entry_watch"
            >{closed ? "토론 결과 보기" : "먼저 구경하기"}</button>
            <span className="sparring-entry__status" role="status">
              {busy ? "선택한 편을 저장하고 있어요." : waiting ? "경기장이 준비되면 바로 입장해요." : ""}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
