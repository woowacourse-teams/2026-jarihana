-- 지급할 회원 ID와 배포에 설정한 한국 시간 적립 시작 시각을 psql 변수로 전달한다.
WITH eligible_member AS (
    SELECT member.id
    FROM member
    WHERE member.id = :'member_id'::bigint
      AND member.withdrawn_at IS NULL
      AND :'points_starts_at'::timestamp <= CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'
      AND EXISTS (
          SELECT 1
          FROM group_member membership
          JOIN groups ON groups.id = membership.group_id
          LEFT JOIN point_group_origin origin ON origin.group_id = groups.id
          WHERE membership.member_id = member.id
            AND membership.joined_at < :'points_starts_at'::timestamp
            AND CASE WHEN origin.group_id IS NOT NULL
                     THEN origin.creator_member_id <> member.id
                     ELSE membership.joined_at > groups.created_at END
      )
      AND NOT EXISTS (
          SELECT 1 FROM point_reward
          WHERE member_id = member.id AND reason = 'FIRST_GROUP_JOIN' AND status <> 'SKIPPED'
      )
), wallet AS (
    INSERT INTO point_wallet (member_id)
    SELECT id FROM eligible_member
    ON CONFLICT (member_id) DO UPDATE SET balance = point_wallet.balance
    RETURNING member_id
)
INSERT INTO point_reward (
    member_id, reason, source_key, scope_key, policy_version, amount, occurred_at, status, next_attempt_at
)
SELECT member_id, 'FIRST_GROUP_JOIN', 'legacy:' || member_id, 'once', 1, 150,
       CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul', 'PENDING', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'
FROM wallet
ON CONFLICT DO NOTHING
RETURNING id, member_id, amount, status;
