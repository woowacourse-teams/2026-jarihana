import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router";

import { useToast } from "../../shared/ui";
import orbitVideo from "../../shared/assets/landing/landing-clubhouse-orbit.mp4";
import orbitPoster from "../../shared/assets/landing/landing-clubhouse-orbit-poster.webp";
import walkVideo from "../../shared/assets/landing/landing-clubhouse-walk.mp4";
import walkPoster from "../../shared/assets/landing/landing-clubhouse-walk-poster.webp";
import decorateImage from "../../shared/assets/landing/landing-clubhouse-decorate.webp";
import insideImage from "../../shared/assets/landing/landing-clubhouse-inside.webp";
import musicImage from "../../shared/assets/landing/landing-clubhouse-music.webp";
import { LandingLoopVideo } from "./LandingLoopVideo";
import "./landing-clubhouse.css";

// 아지트(모임 3D 공간)는 아직 서비스에 열리지 않아, 체험 버튼은 준비 중이라는 안내만 띄운다.
export const CLUBHOUSE_NOTICE = {
  title: "아지트 꾸미기는 곧 열려요",
  description: "동아리와 스터디마다 생기는 3D 아지트를 준비하고 있어요."
};

const highlights = [
  {
    id: "decorate",
    title: "아지트 꾸미기",
    description: "가구를 놓고 벽과 바닥 테마, 조명, 날씨, 시간대까지 바꿔요.",
    image: decorateImage,
    alt: "벽과 바닥을 짙은 나무색 테마로 바꾼 아지트를 위에서 본 모습"
  },
  {
    id: "visit",
    title: "놀러 가기",
    description: "1인칭이나 3인칭 시점으로 걸어 들어가 공지와 활동 기록을 보고 채팅도 열어요.",
    image: insideImage,
    alt: "3인칭 캐릭터가 아지트 거실에 들어선 모습"
  },
  {
    id: "music",
    title: "함께 음악 듣기",
    description: "대기열에 곡을 넣으면 아지트에 있는 모두가 같은 곡을 들어요.",
    image: musicImage,
    alt: "아지트 현관 앞에서 안쪽의 모임 음악 표지판이 보이는 모습"
  }
];

export function LandingClubhouseHero({ active }) {
  const toast = useToast();

  function announce() {
    toast.show(CLUBHOUSE_NOTICE);
  }

  return (
    <section
      aria-current={active ? "step" : undefined}
      aria-labelledby="clubhouse-title"
      className="landing-clubhouse"
      data-guide-chapter="clubhouse"
      id="clubhouse"
    >
      <div className="landing-clubhouse__track">
        <div className="landing-clubhouse__curtain">
          <div aria-hidden="true" className="landing-clubhouse__backdrop">
            <LandingLoopVideo poster={orbitPoster} src={orbitVideo} />
          </div>
          <div className="landing-clubhouse__copy">
            <h1 id="clubhouse-title">
              <span>모임마다 하나씩,</span>
              <span>함께 꾸미는 아지트</span>
            </h1>
            <p className="landing-clubhouse__lead">
              우리만의 아지트를 꾸미고 함께 어울리는 놀이터
            </p>
            <div className="landing-clubhouse__actions">
              <button
                className="landing-button landing-button--mint landing-button--large"
                data-ph-capture-attribute-action="landing_clubhouse_try"
                onClick={announce}
                type="button"
              >
                아지트 꾸며 보기
              </button>
              <Link
                className="landing-button landing-button--quiet landing-button--large"
                data-ph-capture-attribute-action="landing_explore"
                to="/groups?recruiting=true"
              >
                모집 중인 모임 보기
              </Link>
            </div>
          </div>
          <span aria-hidden="true" className="landing-clubhouse__pull">
            끝까지 안 봐도 돼요, 내려 보세요
            <ChevronDown size={18} />
          </span>
        </div>
        <div className="landing-clubhouse__stage">
          <LandingLoopVideo
            label="아지트를 둘러본 뒤 캐릭터가 현관을 지나 거실로 걸어 들어가는 화면"
            poster={walkPoster}
            src={walkVideo}
          />
          <p className="landing-clubhouse__caption">
            <strong>주말 아지트에 놀러 가는 중이에요</strong>
            <button
              className="landing-clubhouse__try"
              data-ph-capture-attribute-action="landing_clubhouse_try"
              onClick={announce}
              type="button"
            >
              직접 꾸며 보기
              <span aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.6} />
              </span>
            </button>
          </p>
        </div>
      </div>
      <ul aria-label="아지트에서 할 수 있는 일" className="landing-container landing-clubhouse__highlights">
        {highlights.map((item) => (
          <li key={item.id}>
            <img alt={item.alt} height="498" loading="lazy" src={item.image} width="960" />
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
