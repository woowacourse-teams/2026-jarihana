export { createRankedAdapter, parseServiceTime } from "./api";
export { peperoDayKeys, usePeperoDayRankings, usePeperoDayStatus } from "./hooks";

export const PEPERO_DAY_PATH = "/events/pepero-day";
// 이벤트가 끝난 뒤 게임방에서 연습으로 하는 주소다.
export const STICK_HALVING_ROOM_PATH = "/games/stick-halving";
