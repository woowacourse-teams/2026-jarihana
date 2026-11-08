import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";

import { Button } from "../../shared/ui";
import {
  RHYTHM_SETTINGS_ID,
  RhythmHarpoonGame
} from "../../features/game/rhythm/RhythmHarpoonGame.jsx";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import "./rhythm-harpoon.css";

export function RhythmHarpoonPage() {
  useEscapeBack("/games/rhythm-harpoon/single");
  const [attempt, setAttempt] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(true);
  // 플레이가 시작되면 설정 서랍을 닫고, 멈추면 다시 연다. 판이 끝났을 때는 결과를 가리지 않도록 닫아 둔다.
  const handlePlayingChange = useCallback((playing, reason) => {
    if (playing) setSettingsOpen(false);
    else if (reason !== "over") setSettingsOpen(true);
  }, []);
  // 플레이 중 버튼을 누르면 포커스가 판을 떠나 먼저 일시정지(서랍 열림)가 된다. 누르기 직전 상태로 토글한다.
  const openBeforePress = useRef(null);
  return (
    <section className="game-player game-player--rhythm" aria-labelledby="rhythm-harpoon-title">
      <header className="game-player__toolbar">
        <Link
          aria-keyshortcuts="Escape"
          className="game-player__back"
          data-ph-capture-attribute-action="rhythm_single_back"
          to="/games/rhythm-harpoon/single"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          싱글 플레이
        </Link>
        <h1 id="rhythm-harpoon-title">혼자 연습</h1>
        <Button
          aria-controls={RHYTHM_SETTINGS_ID}
          aria-expanded={settingsOpen}
          className="game-player__settings"
          data-ph-capture-attribute-action="rhythm_settings_toggle"
          onClick={() => {
            const before = openBeforePress.current ?? settingsOpen;
            openBeforePress.current = null;
            setSettingsOpen(!before);
          }}
          onPointerDown={() => {
            openBeforePress.current = settingsOpen;
          }}
          size="sm"
          variant="secondary"
        >
          <SlidersHorizontal aria-hidden="true" size={16} />
          설정
        </Button>
        <Button
          data-ph-capture-attribute-action="rhythm_harpoon_reload"
          onClick={() => {
            setSettingsOpen(true);
            setAttempt((value) => value + 1);
          }}
          size="sm"
          variant="secondary"
        >
          다시 불러오기
        </Button>
      </header>
      <RhythmHarpoonGame
        key={attempt}
        onPlayingChange={handlePlayingChange}
        settingsOpen={settingsOpen}
      />
    </section>
  );
}
