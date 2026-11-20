import { useEffect, useRef } from "react";
import { MousePointer2, MoveUpRight, Pointer } from "lucide-react";
import { Modal } from "../../shared/ui";
import "./sparring-entry-guide.css";

export const ENTRY_GUIDE_DURATION = 3000;

export function SparringEntryGuide() {
  const guideRef = useRef(null);
  useEffect(() => { guideRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <Modal open dismissible={false} panelClassName="sparring-entry-guide"
      title={<><span className="ui-spinner" aria-hidden="true" />입장 중…</>}
      description="마당에서 이렇게 놀아보세요!">
      <div className="sparring-entry-guide__tips" ref={guideRef} tabIndex={-1}>
        <article className="sparring-entry-guide__tip">
          <div className="sparring-entry-guide__demo sparring-entry-guide__demo--reply" aria-hidden="true">
            <span className="sparring-entry-guide__bubble">
              난 이렇게 생각해!
              <span className="sparring-entry-guide__press">
                <span className="sparring-entry-guide__touch-ring" />
                <MousePointer2 className="sparring-entry-guide__pointer" size={30} fill="white" />
                <Pointer className="sparring-entry-guide__touch" size={32} fill="white" />
              </span>
            </span>
            <span className="sparring-entry-guide__bubble sparring-entry-guide__bubble--answer">내 생각은…</span>
          </div>
          <h3>받아치기</h3>
          <p>말풍선을 누르고<br />내 생각을 보내세요.</p>
        </article>
        <article className="sparring-entry-guide__tip sparring-entry-guide__tip--grab">
          <div className="sparring-entry-guide__demo sparring-entry-guide__demo--grab" aria-hidden="true">
            <span className="sparring-entry-guide__lift">
              <span className="sparring-entry-guide__claw" style={{ backgroundImage: "url(/sparring-arena/assets/character-claw-closed.svg)" }} />
              <span className="sparring-entry-guide__character" style={{ backgroundImage: "url(/sparring-arena/assets/entry-rivals.webp)" }} />
            </span>
            <MoveUpRight className="sparring-entry-guide__throw" size={36} />
          </div>
          <h3>끌어치기</h3>
          <p>캐릭터나 말풍선을 꾹 잡아 끌고,<br />휙 놓아보세요!</p>
        </article>
      </div>
      <p className="sparring-entry-guide__waiting" role="status">잠시 후 마당으로 들어가요.</p>
    </Modal>
  );
}
