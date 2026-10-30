import { createContext, useContext } from "react";

// 데모 재생 상태를 CSS 애니메이션 밖에서 움직이는 장면(녹화 영상 등)에 전달한다.
export const LandingDemoPlaybackContext = createContext({
  paused: false,
  reducedMotion: false,
  state: "complete"
});

export function useLandingDemoPlayback() {
  return useContext(LandingDemoPlaybackContext);
}
