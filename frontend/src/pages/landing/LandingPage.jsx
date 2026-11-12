import { useRef, useState } from "react";

import { LandingShell } from "./LandingChrome";
import { LandingClubhouseHero } from "./LandingClubhouseHero";
import { LandingCoreCards, LandingFeatureCards } from "./LandingFeatureCards";
import { LandingTechSection } from "./LandingTechSection";
import { useLandingChapters } from "./useLandingChapters";
import { useLandingMotion } from "./useLandingMotion";
// 기술 소개의 첫 화면은 이용 가이드 소개와 같은 레이아웃을 쓴다.
import "./landing-guide.css";

// 랜딩은 아지트, 토론하나?와 게임하나? 카드, 핵심 기능 카드(모임 신청, 모임 만들기), 자리하나?를 만드는 방식, 바닥글 순서로 읽는다.
// 세부 기능은 카드가 여는 소개 페이지(/land/join, /land/create, /land/sparring, /land/games)에서 설명한다.
export function LandingPage() {
  const pageRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState("clubhouse");
  useLandingMotion(pageRef);
  useLandingChapters(pageRef, setActiveChapter);

  return (
    <LandingShell rootRef={pageRef}>
      <LandingClubhouseHero active={activeChapter === "clubhouse"} />
      <LandingFeatureCards active={activeChapter === "features"} />
      <LandingCoreCards active={activeChapter === "core"} />
      <LandingTechSection activeChapter={activeChapter} />
    </LandingShell>
  );
}
