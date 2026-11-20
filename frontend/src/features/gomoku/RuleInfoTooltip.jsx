import { Info } from "lucide-react";
import { GomokuTooltip } from "./GomokuTooltip";

export function RuleInfoTooltip() {
  return (
    <GomokuTooltip
      label="대국 규칙 안내"
      action="gomoku_rules_info_open"
      trigger={<Info size={18} aria-hidden="true" />}
      triggerClassName="games-rule-info-trigger"
      panelClassName="games-rule-info-tooltip"
    >
      <section aria-label="기본 규칙">
        <strong>기본 규칙</strong>
        <p>흑돌은 정확히 5개, 백돌은 5개 이상 이으면 이겨요.</p>
        <p>흑돌은 3-3, 4-4와 6개 이상 잇기가 제한돼요.</p>
      </section>
      <section aria-label="제한 없음">
        <strong>제한 없음</strong>
        <p>흑돌과 백돌 모두 5개 이상 이으면 이겨요.</p>
        <p>3-3, 4-4, 6개 이상 잇기 제한이 없어요.</p>
      </section>
    </GomokuTooltip>
  );
}
