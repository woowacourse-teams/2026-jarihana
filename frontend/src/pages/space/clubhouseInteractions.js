import { commonFunctionForItem } from "./commonFunctionAssets";

export const ROOM_LIGHT_SWITCH_ID = "room-general-light-switch";
export const ROOM_LIGHT_TOGGLE_ACTION = "space_general_lighting_toggle";

const ACTIVITY_OBJECTS = new Set(["memory", "clubPinboard", "gameWallBoard", "climbingBoard", "galleryPartition", "foodMap", "bandPoster"]);
const INFORMATION_OBJECTS = new Set(["whiteboard", "projectScreen", "projectDisplay", "menuBoard"]);

export function featureForRoomItem(item) {
  const common = commonFunctionForItem(item);
  if (common) return common.feature;
  if (ACTIVITY_OBJECTS.has(item?.kind)) return "activities";
  if (INFORMATION_OBJECTS.has(item?.kind)) return "info";
  return null;
}

export const SPEECH_DURATION_MS = 8000;
export const SPEECH_MAX_CHARACTERS = 60;

export function activeSpeechMessages(messages, now = Date.now()) {
  const speakers = new Set();
  return [...(messages || [])].reverse().filter((message) => {
    if (!message || !message.memberId || typeof message.content !== "string" || !message.content.trim() ||
      !Number.isFinite(message.expiresAt) || message.expiresAt <= now ||
      message.expiresAt > now + SPEECH_DURATION_MS || speakers.has(String(message.memberId))) return false;
    speakers.add(String(message.memberId));
    return true;
  }).slice(0, 3).reverse().map((message) => {
    const characters = Array.from(message.content.replace(/\s+/g, " ").trim());
    return { ...message, content: characters.length > SPEECH_MAX_CHARACTERS
      ? `${characters.slice(0, SPEECH_MAX_CHARACTERS - 1).join("")}…` : characters.join("") };
  });
}
