# 포인트 API

가입을 마친 회원이 본인의 잔액, 한도와 적립 내역을 조회한다. 모든 요청은 [API 공통 설계](../common-contract.md)를 따른다.

## 잔액과 이번 주 한도

`GET /api/members/me/points`

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "balance": 800,
    "processing": true,
    "resetsAt": "2026-11-09T00:00:00",
    "weeklyQuotas": [
      { "reason": "GROUP_CREATED", "label": "모임 만들기",
        "quota": { "limit": 2, "completed": 1, "pending": 0, "remaining": 1 } },
      { "reason": "GOMOKU_WIN", "label": "오목 승리",
        "quota": { "limit": 3, "completed": 2, "pending": 1, "remaining": 0 } },
      { "reason": "ACTIVITY_POST", "label": "사진 활동기록",
        "quota": { "limit": 2, "completed": 1, "pending": 0, "remaining": 1 } }
    ]
  },
  "error": null
}
```

잔액은 확정된 포인트만 포함한다. 미적립 회원은 0이다. 금액은 JSON 정수로 반환한다. 잔액은 JavaScript 안전 정수 범위 안에서 0 이상이다. `enabled`는 조회 시점에 신규 적립을 받을 수 있는지 나타낸다. `resetsAt`은 한국 시간 기준 다음 주의 시작 시각이다. 처리 중 및 운영 확인 중인 지급도 해당 활동 시각의 한도에 예약한다. `processing`은 자동 처리를 기다리는 `PENDING` 지급 건이 있는지 나타낸다.

`weeklyQuotas`는 등록된 주간 규칙별 한도를 제공한다.

## 적립 내역

`GET /api/members/me/points/transactions?size=20&cursor={nextCursor}`

`items`, `nextCursor`, `hasNext`를 반환한다. 항목의 `id`는 문자열이다. `reason`, `amount`, `occurredAt`, `status`, `skipReason`, `completedAt`을 함께 제공한다. `status`는 `PENDING`, `COMPLETED`, `SKIPPED`, `NEEDS_REVIEW` 중 하나다. `SKIPPED`의 금액은 해당 활동의 보상 기준 금액이며 잔액 증가를 뜻하지 않는다. 커서 또는 페이지 크기가 잘못되면 `400 INVALID_PARAMETER`를 반환한다.

항목의 `label`에는 현재 규칙의 표시 이름을 반환한다. 해당 사유를 모르는 서버에서는 `null`을 반환하며, 클라이언트는 기본 이름을 사용한다.

회원당 1회 보상을 이미 받은 경우의 미적립 기록(`ALREADY_REWARDED`)은 내부에 남기고 내역 응답에서 제외한다.
