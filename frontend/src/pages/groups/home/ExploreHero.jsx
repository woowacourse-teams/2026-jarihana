import { useState } from "react";

import { getHeroArtworkStyle } from "./heroArtworkPreview.js";

const introduction = "크루와 함께할 자리를 찾아보세요";
const periodLabels = { day: "낮", sunset: "노을", night: "밤" };

export function ExploreHero({ children, headline = "", period = "day", isAuthenticated = false }) {
  const [previewPeriod, setPreviewPeriod] = useState("auto");
  const [artworkVersion, setArtworkVersion] = useState("current");
  const isDevelopment = process.env.NODE_ENV === "development";
  const displayedPeriod = isDevelopment && previewPeriod !== "auto" ? previewPeriod : period;
  const heroStyle = isDevelopment
    ? getHeroArtworkStyle(artworkVersion, displayedPeriod)
    : undefined;
  const accent = /세 번|같이|커피|점심|갓생|칼퇴|공범|추억|자리|퇴실|집중력/.exec(headline);
  const highlightedHeadline = (
    <span className="reference-hero__message" id="home-headline">
      {accent ? (
        <>
          {headline.slice(0, accent.index)}
          <span className="reference-hero__headline-accent">{accent[0]}</span>
          {headline.slice(accent.index + accent[0].length)}
        </>
      ) : (
        headline
      )}
    </span>
  );

  return (
    <section
      className="groups-hero reference-hero"
      data-time-of-day={displayedPeriod}
      aria-labelledby="groups-title"
      style={heroStyle}
    >
      {isDevelopment && (
        <div className="reference-hero__preview-controls" aria-label="히어로 개발 미리보기">
          <label className="reference-hero__preview">
            <span>개발 · 시간대</span>
            <select
              aria-label="히어로 배경 미리보기"
              data-ph-capture-attribute-action="home_hero_background_preview_change"
              value={previewPeriod}
              onChange={(event) => setPreviewPeriod(event.target.value)}
            >
              <option value="auto">자동 · {periodLabels[period]}</option>
              <option value="day">낮</option>
              <option value="sunset">노을</option>
              <option value="night">밤</option>
            </select>
          </label>
          <label className="reference-hero__preview">
            <span>이미지 세트</span>
            <select
              aria-label="히어로 이미지 버전"
              aria-describedby="hero-artwork-preview-note"
              data-ph-capture-attribute-action="home_hero_artwork_preview_change"
              value={artworkVersion}
              onChange={(event) => setArtworkVersion(event.target.value)}
            >
              <option value="current">현재 버전</option>
              <option value="classic">보정 세트 (낮·노을·밤)</option>
              <option value="refined">얼굴 보정 (낮·노을·밤)</option>
              <option value="nebula">성운 강조 (밤 전용)</option>
            </select>
          </label>
          <span className="reference-hero__preview-note" id="hero-artwork-preview-note">
            왼쪽 시간대에서 낮·노을·밤을 선택하세요. 성운 강조는 밤에만 달라져요.
          </span>
        </div>
      )}
      <div className="groups-hero__copy">
        <h1
          className="reference-hero__title"
          id="groups-title"
          aria-label={isAuthenticated ? headline : introduction}
        >
          {isAuthenticated ? (
            highlightedHeadline
          ) : (
            <>
              <span>크루와</span>
              <span>
                함께할 <span className="reference-hero__headline-accent">자리</span>를
              </span>
              <span>찾아보세요</span>
            </>
          )}
        </h1>
        <p className="reference-hero__subtitle">
          {isAuthenticated ? (
            <>
              크루와 함께할 <span className="reference-hero__headline-accent">자리</span>를 찾아보세요
            </>
          ) : (
            highlightedHeadline
          )}
        </p>
        {children}
      </div>
    </section>
  );
}
