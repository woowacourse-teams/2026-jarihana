import { LEVELS } from "./engine.mjs";

// 연습 설정과 키 배치는 이 브라우저의 localStorage에 남겨 다시 접속해도 유지한다.
const KEYMAP_KEY = "haengseong-keymap-v1";
const PRACTICE_KEY = "haengseong-practice-settings-v1";

export const DEFAULT_KEYMAP = Object.freeze({
  left: "KeyA",
  down: "KeyS",
  up: "KeyW",
  right: "KeyD",
  retry: "KeyR"
});
export const KEY_ACTIONS = Object.freeze([
  Object.freeze({ id: "left", label: "왼쪽", arrow: "←" }),
  Object.freeze({ id: "down", label: "아래", arrow: "↓" }),
  Object.freeze({ id: "up", label: "위", arrow: "↑" }),
  Object.freeze({ id: "right", label: "오른쪽", arrow: "→" }),
  Object.freeze({ id: "retry", label: "다시 하기", arrow: null })
]);
// 방향키는 항상 같은 방향으로 쓰고, 바꿀 수 있는 키와 겹치지 않게 한다.
export const ARROW_LANES = Object.freeze({
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowRight: "right"
});
const SYMBOLS = {
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`"
};
const ASSIGNABLE = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/;

// 글자, 숫자, 기호 키만 배정한다. Esc, Enter, Space, Tab, 수정 키와 방향키는 게임 조작과 겹쳐 쓰지 않는다.
export function isAssignableKey(code) {
  return typeof code === "string" && (ASSIGNABLE.test(code) || Object.hasOwn(SYMBOLS, code));
}

export function keyLabel(code) {
  if (typeof code !== "string") return "";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  return SYMBOLS[code] ?? code;
}

function validKeymap(value) {
  if (!value || typeof value !== "object") return false;
  const codes = KEY_ACTIONS.map((action) => value[action.id]);
  return codes.every(isAssignableKey) && new Set(codes).size === codes.length;
}

export function readKeymap(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(KEYMAP_KEY) ?? "null");
    if (!validKeymap(parsed)) return { ...DEFAULT_KEYMAP };
    return Object.fromEntries(KEY_ACTIONS.map((action) => [action.id, parsed[action.id]]));
  } catch {
    return { ...DEFAULT_KEYMAP };
  }
}

export function writeKeymap(storage, keymap) {
  if (!validKeymap(keymap)) return false;
  try {
    if (!storage) return false;
    storage.setItem(KEYMAP_KEY, JSON.stringify(keymap));
    return true;
  } catch {
    return false;
  }
}

// 다른 동작이 쓰던 키를 고르면 두 동작의 키를 서로 바꾼다. 배정할 수 없는 키는 null을 돌려준다.
export function assignKey(keymap, actionId, code) {
  if (!KEY_ACTIONS.some((action) => action.id === actionId) || !isAssignableKey(code)) return null;
  const next = { ...keymap };
  const owner = KEY_ACTIONS.find((action) => action.id !== actionId && next[action.id] === code);
  if (owner) next[owner.id] = keymap[actionId];
  next[actionId] = code;
  return { keymap: next, swappedWith: owner?.id ?? null };
}

export function laneForKey(keymap, event) {
  const arrow = ARROW_LANES[event.code] ?? ARROW_LANES[event.key];
  if (arrow) return arrow;
  const action = KEY_ACTIONS.find((item) => item.arrow && keymap[item.id] === event.code);
  return action?.id ?? null;
}

export function isRetryKey(keymap, event) {
  return Boolean(event.code) && event.code === keymap.retry;
}

const RATES = Array.from({ length: 9 }, (_, index) => 1 + index * 0.25);

// 저장된 연습 설정을 검증해 돌려준다. 저장된 값이 없거나 깨졌으면 null이다.
export function readPracticeSettings(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(PRACTICE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      level: Object.hasOwn(LEVELS, parsed.level) ? parsed.level : "easy",
      rate: RATES.includes(parsed.rate) ? parsed.rate : 1,
      volume: Number.isInteger(parsed.volume) && parsed.volume >= 0 && parsed.volume <= 100 ? parsed.volume : 65,
      timingFeedback: parsed.timingFeedback !== false,
      labels: parsed.labels !== false
    };
  } catch {
    return null;
  }
}

// 랭킹 도전 옵션에서 바꾼 음량과 표시 설정을 연습 설정과 같은 곳에 남긴다.
// 연습에서 마지막으로 고른 난이도와 배속은 건드리지 않고, 저장된 값이 없을 때만 fallback을 쓴다.
export function writePlaySettings(storage, { volume, timingFeedback, labels }, fallback) {
  const saved = readPracticeSettings(storage);
  return writePracticeSettings(storage, {
    level: saved?.level ?? fallback.level,
    rate: saved?.rate ?? fallback.rate,
    volume,
    timingFeedback,
    labels
  });
}

export function writePracticeSettings(storage, settings) {
  try {
    if (!storage) return false;
    storage.setItem(
      PRACTICE_KEY,
      JSON.stringify({
        level: settings.level,
        rate: settings.rate,
        volume: settings.volume,
        timingFeedback: settings.timingFeedback,
        labels: settings.labels
      })
    );
    return true;
  } catch {
    return false;
  }
}
