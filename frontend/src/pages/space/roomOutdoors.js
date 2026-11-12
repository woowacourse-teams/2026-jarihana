export const OUTDOOR_PHASES = { dawn: "새벽", day: "낮", dusk: "노을", night: "밤" };
export const OUTDOOR_WEATHER = { clear: "맑음", cloudy: "흐림", rain: "비", snow: "눈" };
export const OUTDOOR_MODES = { live: "실제 날씨", fixed: "시간·날씨 고정", custom: "직접 꾸미기" };
export const DEFAULT_OUTDOORS = Object.freeze({ mode: "live", phase: "day", weather: "clear" });

const fixedProgress = { dawn: 0.035, day: 0.52, dusk: 0.95, night: 0.5 };
const seoulTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

const minutesOfDay = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function weatherFromCode(code) {
  if (code <= 1) return "clear";
  if (code <= 48) return "cloudy";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}

export function liveOutdoors(now, report) {
  const [date, time] = seoulTime.format(now).split(" ");
  const minutes = minutesOfDay(time);
  const today = report?.sunrise.startsWith(date) && report.sunset.startsWith(date);
  const sunrise = today ? minutesOfDay(report.sunrise.slice(11)) : 7 * 60;
  const sunset = today ? minutesOfDay(report.sunset.slice(11)) : 18 * 60;
  const phase = minutes < sunrise - 40 || minutes >= sunset + 40 ? "night" :
    minutes < sunrise + 30 ? "dawn" : minutes < sunset - 35 ? "day" : "dusk";
  const daylightProgress = phase === "night" ? 0.5 : Math.max(0, Math.min(1, (minutes - sunrise) / (sunset - sunrise)));
  return {
    phase, daylightProgress, weather: today ? weatherFromCode(report.weatherCode) : "clear",
    status: today ? report.stale ? "stale" : "current" : "unavailable"
  };
}

export function fixedOutdoors({ phase, weather }) {
  return { phase, weather, daylightProgress: fixedProgress[phase], status: "fixed" };
}

export function validateOutdoors(value) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 3 ||
    typeof value.mode !== "string" || typeof value.phase !== "string" || typeof value.weather !== "string" ||
    !Object.hasOwn(OUTDOOR_MODES, value.mode) || !Object.hasOwn(OUTDOOR_PHASES, value.phase) ||
    !Object.hasOwn(OUTDOOR_WEATHER, value.weather)) return null;
  return { mode: value.mode, phase: value.phase, weather: value.weather };
}
