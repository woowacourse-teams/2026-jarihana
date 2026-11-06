import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "../../shared/ui";
import { RhythmHarpoonGame } from "../../features/game/rhythm/RhythmHarpoonGame.jsx";
import "./rhythm-harpoon.css";

export function RhythmHarpoonPage() {
  const [attempt, setAttempt] = useState(0);
  return (
    <section className="game-player" aria-labelledby="rhythm-harpoon-title">
      <header className="game-player__toolbar">
        <Link
          className="game-player__back"
          data-ph-capture-attribute-action="rhythm_single_back"
          to="/games/rhythm-harpoon/single"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          싱글 플레이
        </Link>
        <h1 id="rhythm-harpoon-title">혼자 연습</h1>
        <Button
          data-ph-capture-attribute-action="rhythm_harpoon_reload"
          onClick={() => setAttempt((value) => value + 1)}
          size="sm"
          variant="secondary"
        >
          다시 불러오기
        </Button>
      </header>
      <RhythmHarpoonGame key={attempt} />
    </section>
  );
}
