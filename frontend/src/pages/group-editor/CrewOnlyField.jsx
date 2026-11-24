import { Checkbox } from "../../shared/ui/index.js";

/*
 * 크루 전용 모임은 크루와 지금 모임원에게만 보인다. 크루 전용으로 켜는 것은 크루인 모임장만 할 수 있고,
 * 위임으로 모임장이 된 비크루는 끄는 것만 할 수 있다. 서버도 같은 규칙으로 거절한다.
 */
export function CrewOnlyField({ canTurnOn, registration }) {
  return (
    <section aria-labelledby="group-editor-visibility-title" className="group-editor__visibility">
      <h2 id="group-editor-visibility-title">공개 범위</h2>
      <Checkbox
        {...registration}
        data-ph-capture-attribute-action="group_visibility_crew_only_toggle"
        description={
          canTurnOn
            ? "크루와 지금 모임원만 이 모임을 볼 수 있어요. 크루가 아니면 목록과 검색에 보이지 않고 신청할 수도 없어요. 이미 들어온 모임원은 그대로 남아요."
            : "크루 전용을 끄면 누구나 이 모임을 볼 수 있어요. 크루가 아니어서 끈 뒤에는 다시 켤 수 없어요."
        }
        label="크루 전용으로 열기"
      />
    </section>
  );
}
