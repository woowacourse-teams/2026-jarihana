import { useState } from "react";
import { Trophy } from "lucide-react";

import { Modal } from "../../../shared/ui";
import { LEVELS } from "./engine.mjs";
import { RhythmRanking } from "./RhythmRanking.jsx";
import { CLAY_STYLE } from "./SpriteFrame.jsx";
import { useNarrowScreen } from "./useNarrowScreen.js";

// 옵션과 결과 옆의 랭킹 자리다. 태블릿보다 좁은 화면에서는 랭킹 대신 버튼을 두고, 누르면 창으로 랭킹을 보여 준다.
export function RhythmRankingSlot({ level }) {
  const narrow = useNarrowScreen();
  const [open, setOpen] = useState(false);
  if (!narrow) return <RhythmRanking level={level} />;
  return (
    <>
      <button
        className="button rhythm-ranking-open"
        data-ph-capture-attribute-action="rhythm_ranking_modal_open"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Trophy aria-hidden="true" size={18} />
        {LEVELS[level].name} 랭킹 보기
      </button>
      <Modal
        closeAction="rhythm_ranking_modal_close"
        onOpenChange={setOpen}
        open={open}
        panelClassName="rhythm-ranking-modal"
        title={LEVELS[level].name + " 랭킹"}
      >
        {/* 창은 판 화면 밖(body)에 열리므로 랭킹 카드의 클레이 색을 여기서 다시 입힌다. */}
        <div className="rhythm-game rhythm-game--clay rhythm-ranking-sheet" style={CLAY_STYLE}>
          <RhythmRanking heading={false} level={level} />
        </div>
      </Modal>
    </>
  );
}
