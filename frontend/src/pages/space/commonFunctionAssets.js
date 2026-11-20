// Functional identity stays the same in every theme; placement and accent remain editable.
export const COMMON_FUNCTION_ASSETS = Object.freeze([
  { kind: "clubDashboard", feature: "dashboard", name: "모임 대시보드", shortLabel: "모임 안내", symbol: "i",
    description: "공지와 일정 · 모임 정보 · 참여자 · 채팅 · 모집", color: "#7b61b5", action: "group_dashboard_open" },
  { kind: "activityBoard", feature: "activities", name: "활동 사진 보드", shortLabel: "활동 기록", symbol: "▧",
    description: "함께 남긴 활동 기록과 사진 모아 보기", color: "#43857a", action: "group_activities_open" },
  { kind: "musicConsole", feature: "music", name: "우리 모임 턴테이블", shortLabel: "모임 음악", symbol: "♪",
    description: "지금 흐르는 음악 · 함께 듣는 재생목록", color: "#b7803d", action: "space_music_open" }
].map(Object.freeze));

export const COMMON_ASSET_CATALOG = Object.freeze([
  { kind: "activityBoard", name: "활동 사진 보드", width: 2.4, depth: 0.7, height: 2.5, category: "furniture", collection: "essentials" },
  { kind: "clubDashboard", name: "모임 대시보드", width: 1.8, depth: 0.7, height: 2.3, category: "furniture", collection: "essentials" }
].map(Object.freeze));

export const commonFunctionForItem = (item) => COMMON_FUNCTION_ASSETS.find((entry) => entry.kind === item?.kind);

export function commonAssetStatus(items) {
  return COMMON_FUNCTION_ASSETS.map((entry) => ({ ...entry, items: items.filter((item) => item.kind === entry.kind) }));
}
