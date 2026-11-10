import { useRef, useState } from "react";

import { LandingShell } from "./LandingChrome";
import { LandingClubhouseHero } from "./LandingClubhouseHero";
import { LandingFeatureCards } from "./LandingFeatureCards";
import { LandingTechSection } from "./LandingTechSection";
import { useLandingChapters } from "./useLandingChapters";
import { useLandingMotion } from "./useLandingMotion";
// 기술 소개의 첫 화면은 이용 가이드 소개와 같은 레이아웃을 쓴다.
import "./landing-guide.css";

// 랜딩은 아지트, 대표 기능 세 가지, 자리하나를 만드는 방식, 바닥글 순서로 읽는다.
export function LandingPage() {
  const pageRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState("clubhouse");
  useLandingMotion(pageRef);
  useLandingChapters(pageRef, setActiveChapter);

  return (
    <LandingShell rootRef={pageRef}>
      <LandingClubhouseHero active={activeChapter === "clubhouse"} />
      <LandingFeatureCards active={activeChapter === "features"} />
      <LandingTechSection activeChapter={activeChapter} />
    </LandingShell>
  );
}
