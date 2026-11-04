export { createRankedAdapter, parseServiceTime } from "./api";
export { peperoDayKeys, usePeperoDayRankings, usePeperoDayStatus } from "./hooks";

export const PEPERO_DAY_PATH = "/events/pepero-day";
// 이벤트가 끝난 뒤 게임방에서 하는 주소다. 연습과 게임방 순위 도전이 있다.
export const STICK_HALVING_ROOM_PATH = "/games/stick-halving";
