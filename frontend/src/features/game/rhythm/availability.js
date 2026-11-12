// 혼자 연습을 열어 둘지 정한다. 2026-11-11부터 랭킹 도전만 열었을 때의 반응을 보려고 잠시 닫아 둔다.
// 닫아 두면 싱글 플레이에서 고를 모드가 랭킹 도전뿐이라, 싱글 플레이를 누르면 바로 랭킹 도전의 옵션 화면을 연다.
// 연습 주소는 처음 화면으로 보낸다. 연습에서 바꾸던 음량, 표시, 키 배치는 랭킹 도전 옵션에서도 바꿀 수 있다.
// 연습 화면과 싱글 플레이 화면 코드는 그대로 두므로 true로 바꾸면 예전 흐름으로 돌아간다.
export const RHYTHM_PRACTICE_ENABLED = false;

export const RHYTHM_ENTRY_PATH = "/games/rhythm-harpoon";
export const RHYTHM_SINGLE_PATH = "/games/rhythm-harpoon/single";
export const RHYTHM_PRACTICE_PATH = "/games/rhythm-harpoon/practice";
export const RHYTHM_CHALLENGE_PATH = "/games/rhythm-harpoon/challenge";
export const RHYTHM_LESSON_PATH = "/games/rhythm-harpoon/learn";

// 싱글 플레이를 시작하면 가는 곳
export const RHYTHM_SINGLE_START_PATH = RHYTHM_PRACTICE_ENABLED
  ? RHYTHM_SINGLE_PATH
  : RHYTHM_CHALLENGE_PATH;

// 랭킹 도전에서 한 단계 돌아가는 곳. 싱글 플레이 화면이 없으면 처음 화면으로 간다.
export const RHYTHM_CHALLENGE_BACK = RHYTHM_PRACTICE_ENABLED
  ? { path: RHYTHM_SINGLE_PATH, label: "싱글 플레이", action: "rhythm_single_back" }
  : { path: RHYTHM_ENTRY_PATH, label: "처음 화면", action: "rhythm_entry_back" };
