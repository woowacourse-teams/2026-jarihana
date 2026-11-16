import { browserStorage, readLessonProgress } from "./lesson.mjs";

// 리듬 작살을 처음 여는 사람에게 튜토리얼(따라 하기)을 권할지 쿠키로 정한다.
// 한 번 묻고 나면(보기를 고르든 닫든) 쿠키를 남겨 다시 묻지 않는다.
// 쿠키가 없어도 이 브라우저에 따라 하기를 마치거나 건너뛴 기록이 있으면 처음이 아니다.
const COOKIE_NAME = "rhythm_tutorial_offered";
const COOKIE_PATH = "/games/rhythm-harpoon";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function hasOfferedCookie() {
  const prefix = `${COOKIE_NAME}=`;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .some((item) => item.startsWith(prefix));
}

export function shouldOfferRhythmTutorial(storage = browserStorage()) {
  if (typeof document === "undefined" || hasOfferedCookie()) return false;
  return !readLessonProgress(storage).completed;
}

export function rememberRhythmTutorialOffered() {
  const attributes = [
    `${COOKIE_NAME}=1`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax"
  ];
  if (typeof location !== "undefined" && location.protocol === "https:") {
    attributes.push("Secure");
  }
  document.cookie = attributes.join("; ");
}
