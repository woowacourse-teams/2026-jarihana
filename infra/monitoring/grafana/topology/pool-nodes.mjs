// Flow drives existing SVG elements, so prepare a bounded set and hide unused slots.
export const POOL_NODE_LIMIT = 100;
export const POOL_MOTION_SECONDS = 3.2;

const POOL_HOME_X = 637;
// Fan, shared straight section, and entry fan stop against the DB's outside edge.
const FAN_X = [0, 80, 173, 213];
const DOCK_X = [401, 413, 417, 429];
const FAN_FRACTION = 0.4;
const TRUNK_FRACTION = 0.9;

function motionStyles() {
  const frame = (percent, t, returning = false, replay = false) => {
    const progress = returning ? 1 - t : t;
    const inFan = progress <= FAN_FRACTION;
    const inTrunk = !inFan && progress <= TRUNK_FRACTION;
    const local = inFan ? progress / FAN_FRACTION : inTrunk
      ? (progress - FAN_FRACTION) / (TRUNK_FRACTION - FAN_FRACTION)
      : (progress - TRUNK_FRACTION) / (1 - TRUNK_FRACTION);
    const u = 1 - local;
    const weights = [u ** 3, 3 * u ** 2 * local, 3 * u * local ** 2, local ** 3];
    const controls = inFan ? FAN_X : DOCK_X;
    const x = inTrunk ? FAN_X[3] + (DOCK_X[0] - FAN_X[3]) * local
      : controls.reduce((sum, value, index) => sum + value * weights[index], 0);
    const merge = inFan ? weights[2] + weights[3] : inTrunk ? 1 : weights[0] + weights[1];
    const end = inFan || inTrunk ? 0 : weights[2] + weights[3];
    const color = replay ? `fill:${percent === 0 || percent === 100 ? '#76b4ff' : '#f6ba6a'};stroke:${percent === 0 || percent === 100 ? '#76b4ff' : '#f6ba6a'};` : '';
    return `${Number(percent.toFixed(2))}% {transform:translate(${x.toFixed(3)}px,calc(var(--pool-merge-y) * ${merge.toFixed(5)} + var(--pool-trip-y) * ${end.toFixed(5)}));${color}}`;
  };
  const steps = [...new Set([...Array.from({ length: 26 }, (_, index) => index / 25), FAN_FRACTION, TRUNK_FRACTION, 1 - FAN_FRACTION, 1 - TRUNK_FRACTION])].sort((a, b) => a - b);
  return [
    `@keyframes pool-borrow {${steps.map(t => frame(t * 100, t)).join('')}}`,
    `@keyframes pool-return {${steps.map(t => frame(t * 100, t, true)).join('')}}`,
    `@keyframes pool-replay {${steps.map(t => frame(t * 36, t, false, true)).join('')}${steps.map(t => frame(58 + t * 42, t, true, true)).join('')}}`,
    '@keyframes pool-transfer {from {transform:translate(var(--pool-from-x),var(--pool-from-y))} to {transform:translate(var(--pool-to-x),var(--pool-to-y))}}',
    '.pool-slot {outline:none; cursor:pointer;}',
    '.pool-slot[visibility="hidden"] {pointer-events:none;}',
    '.pool-slot .pool-hit {pointer-events:stroke;}',
    '.pool-slot:hover .pool-edge, .pool-slot:focus .pool-edge {stroke:#ffffff; stroke-opacity:1; stroke-width:3;}',
    '.pool-slot:hover .pool-home, .pool-slot:focus .pool-home, .pool-slot:hover .pool-connection, .pool-slot:focus .pool-connection {stroke:#ffffff; stroke-width:2;}',
    '.pool-slot .pool-tooltip {opacity:0; pointer-events:none;}',
    '.pool-slot:hover .pool-tooltip, .pool-slot:focus .pool-tooltip {opacity:1;}',
    '.pool-slot .pool-tooltip [data-state] {display:none;}',
    '.pool-slot[data-state="active"] .pool-tooltip [data-state="active"], .pool-slot[data-state="idle"] .pool-tooltip [data-state="idle"], .pool-slot[data-state="uncreated"] .pool-tooltip [data-state="uncreated"], .pool-slot[data-state="unknown"] .pool-tooltip [data-state="unknown"] {display:inline;}',
  ].join('\n');
}

function slotMarkup(index) {
  return `<a id="pool-slot-${index}" class="pool-slot" href="/d/jarihana-canvas?viewPanel=4" data-pool-slot="${index}" data-state="unknown" visibility="hidden" tabindex="-1" aria-label="커넥션 풀 시각 슬롯 ${index}, 상태 확인 불가, 집계 보기이며 물리 커넥션 ID가 아닙니다.">
  <path id="pool-edge-${index}" class="pool-edge" data-pool-slot="${index}" d="M637 160 C717 160 810 160 850 160 M1038 160 C1050 160 1054 160 1066 160" fill="none" stroke="#536880" stroke-width="1.5" stroke-opacity="0.55" stroke-dasharray="none" visibility="hidden"/>
  <path class="pool-hit pool-edge-hit" data-pool-slot="${index}" d="M637 160 C717 160 810 160 850 160 M1038 160 C1050 160 1054 160 1066 160" fill="none" stroke="transparent" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" visibility="hidden"/>
  <ellipse class="pool-home" data-pool-slot="${index}" cx="${POOL_HOME_X}" cy="160" rx="5.2" ry="5.2" fill="#0c111b" stroke="#536880" stroke-width="1" visibility="hidden"/>
  <circle class="pool-connection" data-pool-slot="${index}" data-pool-state="unknown" data-pool-replay="false" cx="${POOL_HOME_X}" cy="160" r="3.5" fill="#0c111b" fill-opacity="0" stroke="#536880" stroke-width="1" visibility="hidden" style="--pool-from-x:0px; --pool-to-x:0px; --pool-from-y:0px; --pool-to-y:0px; animation:pool-transfer ${POOL_MOTION_SECONDS}s linear both;"/>
  <g class="pool-tooltip" transform="translate(680 4)">
    <rect width="488" height="96" rx="8" fill="#101a2a" stroke="#536880" stroke-width="1" opacity="0.96"/>
    <text x="16" y="30" font-size="18" font-weight="600" fill="#e6edf7">연결 자리 ${index} · <tspan data-state="active" fill="#4dd7ba">사용 중</tspan><tspan data-state="idle" fill="#76b4ff">유휴</tspan><tspan data-state="uncreated" fill="#93a4bd">미생성</tspan><tspan data-state="unknown" fill="#93a4bd">확인 불가</tspan></text>
    <text x="16" y="58" font-size="16" fill="#b8c7dd"><tspan data-state="active">애플리케이션이 DB 작업에 사용 중</tspan><tspan data-state="idle">연결을 유지한 채 다음 작업을 기다림</tspan><tspan data-state="uncreated">최대 풀 안의 아직 만들지 않은 자리</tspan><tspan data-state="unknown">현재 수집값으로 상태를 판별할 수 없음</tspan></text>
    <text x="16" y="84" font-size="16" fill="#93a4bd">집계 표현 · 개별 ID 아님 | 클릭 / Enter: 풀 상세</text>
  </g>
</a>`;
}

export function buildPoolNodes() {
  const indices = Array.from({ length: POOL_NODE_LIMIT }, (_, index) => index + 1);
  const row = index => `(${index - 1} - (slots - 1) / 2)`;
  const homeY = index => `(160 + ${row(index)} * stepY)`;
  const dockY = index => `(160 + ${row(index)} * dockStepY)`;
  return {
    svg: `<style>${motionStyles()}</style>\n`
      + indices.map(slotMarkup).join('\n'),
    bespoke: {
      namespace: 'pool-nodes',
      dataRefs: ['db_active', 'db_idle', 'db_active_previous', 'db_max_previous', 'db_completed', 'db_completed_previous'],
      formulas: [
        "hasMax = data['db_max'] != null and data['db_max'] >= 0",
        "known = hasMax and data['db_active'] != null and data['db_active'] >= 0 and data['db_idle'] != null and data['db_idle'] >= 0",
        "capacity = hasMax ? floor(data['db_max']) : 0",
        "active = known ? min(capacity, round(data['db_active'])) : 0",
        "idle = known ? min(capacity - active, round(data['db_idle'])) : 0",
        "previousKnown = known and data['db_active_previous'] != null and data['db_active_previous'] >= 0 and data['db_max_previous'] == capacity",
        "previousActive = previousKnown ? min(capacity, round(data['db_active_previous'])) : active",
        "activityKnown = previousKnown and data['db_completed'] != null and data['db_completed_previous'] != null and data['db_completed_previous'] >= 0 and data['db_completed'] >= data['db_completed_previous']",
        "recentUses = activityKnown ? floor(data['db_completed'] - data['db_completed_previous']) : 0",
        'replayStart = max(active, previousActive)',
        'replayAvailable = max(0, active + idle - replayStart)',
        'replayCount = max(0, min(active + idle - replayStart, recentUses - max(0, previousActive - active)))',
        "activityLabel = activityKnown ? concat('최근 수집 구간 사용 완료 ', string(recentUses), '회') : '최근 사용 확인 불가'",
        `slots = min(capacity, ${POOL_NODE_LIMIT})`,
        'stepY = min(12, 108 / max(1, slots - 1))',
        'dockStepY = min(8, 72 / max(1, slots - 1))',
        `poolStatus = not hasMax ? '수집 확인 불가' : capacity == 0 ? '설정된 연결 없음' : capacity > ${POOL_NODE_LIMIT} ? concat('+ ', string(capacity - ${POOL_NODE_LIMIT}), ' 자리') : ''`,
      ],
      drives: [...indices.map((index) => ({
        elementName: 'a',
        elementPosition: index,
        attribsSet: {
          visibility: `hasMax and ${index} <= slots ? 'visible' : 'hidden'`,
          href: "utils.variablesReplace('/d/jarihana-canvas?viewPanel=4&var-environment=${environment}&from=${__from}&to=${__to}')",
          tabindex: `hasMax and ${index} <= slots ? '0' : '-1'`,
          'data-state': `not known ? 'unknown' : ${index} <= active ? 'active' : ${index} <= active + idle ? 'idle' : 'uncreated'`,
          'aria-label': `concat('커넥션 풀 시각 슬롯 ${index}, 상태 ', not known ? '확인 불가' : ${index} <= active ? '사용 중' : ${index} <= active + idle ? '유휴' : '미생성', ', 집계 보기이며 물리 커넥션 ID가 아닙니다. HikariCP 이력으로 이동')`,
        },
      })), ...indices.flatMap((index) => {
        const pathStart = `'M${POOL_HOME_X} ', string(${homeY(index)}), ' C${POOL_HOME_X + FAN_X[1]} ', string(${homeY(index)}), ' ${POOL_HOME_X + FAN_X[2]} 160 ${POOL_HOME_X + FAN_X[3]} 160`;
        const pathEnd = ` C${POOL_HOME_X + DOCK_X[1]} 160 ${POOL_HOME_X + DOCK_X[2]} ', string(${dockY(index)}), ' ${POOL_HOME_X + DOCK_X[3]} ', string(${dockY(index)}))`;
        const d = `concat(${pathStart} M${POOL_HOME_X + DOCK_X[0]} 160${pathEnd}`;
        return [{
          elementName: 'path',
          elementPosition: index * 2 - 1,
          attribsSet: {
            visibility: `hasMax and ${index} <= slots ? 'visible' : 'hidden'`,
            d,
            stroke: `not known ? '#536880' : ${index} <= active ? '#4dd7ba' : ${index} <= active + idle ? '#76b4ff' : '#536880'`,
            'stroke-opacity': `not known ? 0.25 : ${index} <= active ? 0.95 : ${index} <= active + idle ? 0.55 : 0.2`,
            'stroke-dasharray': `known and ${index} > active + idle ? '3 5' : 'none'`,
            'stroke-width': 'slots > 30 ? 0.7 : 1.5',
          },
        }, {
          elementName: 'path',
          elementPosition: index * 2,
          attribsSet: {
            visibility: `hasMax and ${index} <= slots ? 'visible' : 'hidden'`,
            d,
          },
        }];
      }), ...indices.map((index) => ({
        elementName: 'ellipse',
        elementPosition: index,
        attribsSet: {
          visibility: `hasMax and ${index} <= slots ? 'visible' : 'hidden'`,
          cx: String(POOL_HOME_X),
          cy: homeY(index),
          rx: 'min(5.2, stepY / 2 - 0.15)',
          ry: 'min(5.2, stepY / 2 - 0.15)',
        },
      })), ...indices.map((index) => {
        const distance = String(DOCK_X[3]);
        const distanceY = `(${row(index)} * (dockStepY - stepY))`;
        const to = `(known and ${index} <= active ? ${distance} : 0)`;
        const from = `(previousKnown ? (${index} <= previousActive ? ${distance} : 0) : ${to})`;
        // If counts are unknown or a slot disappeared, do not invent a return event.
        const start = `(known and ${index} <= active + idle ? ${from} : ${to})`;
        const local = `(${index} - replayStart - 1)`;
        const rank = `(${local} < ceil(replayAvailable / 2) ? ${local} * 2 : (${local} - ceil(replayAvailable / 2)) * 2 + 1)`;
        const replay = `(activityKnown and ${index} > replayStart and ${index} <= active + idle and ${rank} < replayCount)`;
        const toY = `(known and ${index} <= active ? ${distanceY} : 0)`;
        const fromY = `(previousKnown and known and ${index} <= active + idle ? (${index} <= previousActive ? ${distanceY} : 0) : ${toY})`;
        const delay = `(${replay} ? ${rank} * min(0.24, 1.2 / max(1, replayCount - 1)) : (${start} != ${to} ? ${index - 1} * min(0.24, 1.2 / max(1, slots - 1)) : 0))`;
        return {
          elementName: 'circle',
          elementPosition: index,
          attribsSet: {
          visibility: `hasMax and ${index} <= slots ? 'visible' : 'hidden'`,
          cx: String(POOL_HOME_X),
          cy: homeY(index),
          r: 'min(3.5, dockStepY / 2 - 0.15)',
          fill: `not known ? '#93a4bd' : ${index} <= active ? '#4dd7ba' : ${index} <= active + idle ? '#76b4ff' : '#0c111b'`,
          stroke: `not known ? '#93a4bd' : ${index} <= active ? '#4dd7ba' : ${index} <= active + idle ? '#76b4ff' : '#536880'`,
          'fill-opacity': `not known ? 0.25 : ${index} <= active + idle ? 1 : 0`,
          'data-pool-state': `not known ? 'unknown' : ${index} <= active ? 'active' : ${index} <= active + idle ? 'idle' : 'uncreated'`,
          'data-pool-replay': `${replay} ? 'true' : 'false'`,
          style: `concat('--pool-from-x:', string(${start}), 'px; --pool-to-x:', string(${to}), 'px; --pool-from-y:', string(${fromY}), 'px; --pool-to-y:', string(${toY}), 'px; --pool-trip-x:', string(${distance}), 'px; --pool-trip-y:', string(${distanceY}), 'px; --pool-merge-y:', string(-${row(index)} * stepY), 'px; animation:', ${replay} ? 'pool-replay' : ${start} < ${to} ? 'pool-borrow' : ${start} > ${to} ? 'pool-return' : 'pool-transfer', ' ${POOL_MOTION_SECONDS}s linear ', string(${delay}), 's both;')`,
          },
        };
      })],
    },
  };
}
