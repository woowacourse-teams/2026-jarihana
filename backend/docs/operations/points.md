# 포인트 운영

## 배포와 활성화

운영에서는 [Blue/Green 릴리스 Compose 지원](../../../infra/blue-green-deploy/docs/deployment.md)을 준비한 뒤 포인트 백엔드를 배포한다. 오목 전적의 대국 기록 저장이 먼저 배포되어야 한다.

처음 배포할 때는 `POINTS_STARTS_AT`을 비워 적립을 끈다. 신버전 전환이 끝나면 배포 대상 GitHub Environment의 Variables에 모든 인스턴스가 공유할 한국 시간 시작 시각을 `YYYY-MM-DDTHH:mm:ss` 형식으로 설정하고 백엔드를 다시 배포한다. Compose를 직접 실행할 때는 실행 환경의 `POINTS_STARTS_AT`에 같은 값을 설정한다. 시작 시각 이후에는 이벤트에 보상 정책 버전과 금액을 기록한다.

`V33`에서 포인트 테이블과 적립 사유 형식, 모임별 중복 및 주간 한도 조회에 필요한 인덱스를 만든다.

## 처리와 복구

적립이 시작되면 워커가 가입 보상을 받지 않은 회원을 30초마다 최대 100명씩 찾아 지급을 예약한다. 신규 가입 때 예약하는 보상과 회원별 지급 자격을 공유한다.

활동과 지급 예정 작업을 함께 저장한다. 워커는 원장, 잔액, 지급 완료를 별도 트랜잭션에서 함께 커밋한다. 일시적인 DB 오류는 5초부터 최대 5분까지 간격을 늘려가며 횟수 제한 없이 재시도한다. 재시도 대상이 아닌 오류는 첫 실패에 `NEEDS_REVIEW`로 전환한다. 운영 확인이 필요한 경우 `points.reward.failed` 로그의 지급 작업 ID로 원인을 찾는다. 원인을 해소한 다음 아래 작업으로 재개한다. `next_attempt_at`에는 한국 시간을 사용한다.

```sql
UPDATE point_reward
SET status = 'PENDING', next_attempt_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'
WHERE id = :reward_id AND status = 'NEEDS_REVIEW';
```

재개는 동일한 작업의 예약, 금액, 원본 식별자를 유지한다. 운영에서 `point_reward`의 상태별 건수, 가장 오래된 대기 시각, `point_ledger`의 발행량을 확인한다.

## 기존 회원의 첫 모임 합류 보상

포인트 도입 후 운영진은 확인한 대상 회원 ID마다 [수동 지급 SQL](../../db/operations/points-first-join-grant.sql)을 실행한다. `points_starts_at`에는 배포에 설정한 `POINTS_STARTS_AT` 값을 그대로 넣는다.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v member_id="$TARGET_MEMBER_ID" -v points_starts_at="$POINTS_STARTS_AT" \
  -f backend/db/operations/points-first-join-grant.sql
```

SQL은 시작 시각 전에 다른 모임에 합류한 활성 회원의 첫 합류 보상 150P를 예약한다. 자신이 모임을 만들 때 생긴 소속은 제외하고, 합류한 뒤 모임장을 위임받은 소속은 인정한다. 지급 건 ID가 반환되면 기존 포인트 워커가 잔액과 원장을 반영한다. 대상이 아니거나 이미 첫 합류 보상을 예약 또는 지급받았다면 반환 행이 없다.

[포인트 도메인 모델](../context/domain/model/points.md) / [포인트 API](../context/api/endpoints/points.md) / [새 기능에 적립 연결](../point-reward-integration.md)
