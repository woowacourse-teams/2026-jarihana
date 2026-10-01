import { useEffect, useState } from "react";

const seoulHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  hourCycle: "h23"
});
const nightHeadlines = [
  "안 자요? 잘됐네. 공범 구하던 참인데.",
  "내일 일찍 일어난다던 분 아니세요?",
  "자기 전 5분만. 아까도 그러셨잖아요.",
  "내일의 제가 말리는데, 걔는 지금 없잖아요.",
  "다들 자나? 나 몰래 모임하나?"
];
const timeSlots = [
  { until: 6, headlines: nightHeadlines },
  {
    until: 11,
    headlines: [
      "이 시간에 접속? 갓생인가요, 밤샘인가요?",
      "갓생 살랬더니 갓 일어났네.",
      "눈은 떴는데 사회성은 아직 로딩 중.",
      "일찍 일어난 새도 커피 없으면 별수 없어요.",
      "일단 만나죠. 정신은 만나서 차리고."
    ]
  },
  {
    until: 13,
    headlines: [
      "밥 먹을 사람 구함. ‘아무거나’ 금지.",
      "코드보다 어려운 문제: 점심 뭐 먹지?",
      "혼밥하면 남의 돈가스 한 조각 못 뺏잖아요.",
      "먹으러 모였는데 네트워킹이라고 해두죠.",
      "밥 먹으러 가나? 옆에 자리하나?",
      "오늘 구식 별로라던데, 나가서 먹을래요?"
    ]
  },
  {
    until: 17,
    headlines: [
      "혼자 졸면 낮잠, 같이 졸면 스터디.",
      "방금 같은 줄 세 번 읽으셨죠?",
      "코드 리뷰 말고 베개 리뷰하고 싶은 시간.",
      "딴짓도 같이 하면 추억이라고 우겨봅시다.",
      "집중력 나갔는데, 우리도 잠깐 나갈까요?",
      "퇴실 체크, 잊지 마세요.",
      "칼퇴. 칼퇴."
    ]
  },
  {
    until: 19,
    headlines: [
      "오늘도 집 가서 유튜브랑 약속 있으세요?",
      "오늘 대화 상대가 AI뿐이었던 건 아니죠?",
      "집에 가기엔 아쉽고, 공부하기엔 지쳤고.",
      "퇴실은 했고, 해산은 안 했고.",
      "오늘 하루, 코드만 보다 끝내긴 억울하잖아요.",
      "오늘 그냥 집에 가게요?",
      "자리해야지?",
      "빨리 집 안 가고 뭐 해요."
    ]
  },
  { until: 24, headlines: nightHeadlines }
];

export function sessionHeadline(now, variant, isAtPangyo = false) {
  const hour = Number(seoulHour.format(now));
  if (isAtPangyo && (hour >= 19 || hour < 6)) return "왜 아직 집 안 갔어요?";
  const { headlines } = timeSlots.find(({ until }) => hour < until);
  return headlines[Math.floor(variant * headlines.length)];
}

export function sessionHeroPeriod(now) {
  const hour = Number(seoulHour.format(now));
  if (hour < 6 || hour >= 20) return "night";
  return hour < 17 ? "day" : "sunset";
}

export function useSessionHero(isAtPangyo = false) {
  const [variant] = useState(Math.random);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer;
    function scheduleRefresh(current) {
      const hourMilliseconds = 60 * 60 * 1000;
      timer = window.setTimeout(
        refreshHeadline,
        hourMilliseconds - (current.getTime() % hourMilliseconds)
      );
    }
    function refreshHeadline() {
      window.clearTimeout(timer);
      const current = new Date();
      setNow(current);
      scheduleRefresh(current);
    }
    scheduleRefresh(new Date());
    window.addEventListener("focus", refreshHeadline);
    document.addEventListener("visibilitychange", refreshHeadline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshHeadline);
      document.removeEventListener("visibilitychange", refreshHeadline);
    };
  }, []);

  return {
    headline: sessionHeadline(now, variant, isAtPangyo),
    period: sessionHeroPeriod(now)
  };
}

export function useSessionHeadline(isAtPangyo = false) {
  return useSessionHero(isAtPangyo).headline;
}
