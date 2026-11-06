# 포인트 API

가입을 마친 회원이 본인의 잔액, 한도, 적립 내역을 조회하고 기존 소속 보상을 요청한다. 모든 요청은 [API 공통 설계](../common-contract.md)를 따른다.

- [포인트 도메인 모델](../../domain/model/points.md)
- [적립 조건과 지급액](../../domain/business-policies.md#포인트-적립)
- [새 기능에 적립 연결](../../../point-reward-integration.md)
- [배포와 장애 복구](../../../operations/points.md)
- [향후 상점 계약 초안](../../../proposals/points-shop.md)

## 잔액과 이번 주 한도

`GET /api/members/me/points`

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "balance": 80,
    "processing": true,
    "gomokuWeekly": { "limit": 3, "completed": 2, "pending": 1, "remaining": 0 },
    "activityPostWeekly": { "limit": 2, "completed": 1, "pending": 0, "remaining": 1 },
    "resetsAt": "2026-11-09T00:00:00",
    "weeklyQuotas": [
      { "reason": "GOMOKU_WIN", "label": "오목 승리",
        "quota": { "limit": 3, "completed": 2, "pending": 1, "remaining": 0 } },
      { "reason": "ACTIVITY_POST", "label": "사진 활동기록",
        "quota": { "limit": 2, "completed": 1, "pending": 0, "remaining": 1 } }
    ]
  },
  "error": null
}
```

잔액은 확정된 포인트만 포함한다. 미적립 회원은 0이다. 금액은 JSON 정수로 반환한다. 잔액은 JavaScript 안전 정수 범위 안에서 0 이상이다. `enabled`는 조회 시점에 신규 적립을 받을 수 있는지 나타낸다. `resetsAt`은 한국 시간 기준 다음 주의 시작 시각이다. 처리 중 및 운영 확인 중인 지급도 해당 활동 시각의 한도에 예약한다. `processing`은 주간 한도에 포함되지 않는 지급도 포함해 미완료 작업이 있는지 나타낸다.

`weeklyQuotas`는 등록된 주간 규칙을 제공한다. `gomokuWeekly`와 `activityPostWeekly`는 이전 클라이언트 호환을 위해 함께 반환한다.

## 적립 내역

`GET /api/members/me/points/transactions?size=20&cursor={nextCursor}`

`items`, `nextCursor`, `hasNext`를 반환한다. 항목의 `id`는 문자열이다. `reason`, `amount`, `occurredAt`, `status`, `skipReason`, `completedAt`을 함께 제공한다. `status`는 `PENDING`, `COMPLETED`, `SKIPPED`, `NEEDS_REVIEW` 중 하나다. `SKIPPED`의 금액은 해당 활동의 보상 기준 금액이며 잔액 증가를 뜻하지 않는다. 커서 또는 페이지 크기가 잘못되면 `400 INVALID_PARAMETER`를 반환한다.

항목의 `label`에는 현재 규칙의 표시 이름을 반환한다. 해당 사유를 모르는 서버에서는 `null`을 반환하며, 클라이언트는 기본 이름을 사용한다.

이전 오목 보상 정책에서 같은 상대와의 대국으로 미적립된 내역은 `SAME_OPPONENT` 사유를 유지한다.

## 기존 소속 보상

`POST /api/members/me/points/first-join-claim`

본문 없이 호출한다. HTTP 200으로 응답한다. 보상 작업을 새로 등록하면 `data.queued: true`를 반환한다. 적용 시작 전 가입한 유효 소속이 없거나, 이미 첫 합류 보상을 예약 또는 완료했다면 `false`를 반환한다. 신규 합류와 기존 소속의 보상은 회원당 하나의 지급 자격을 공유한다.
