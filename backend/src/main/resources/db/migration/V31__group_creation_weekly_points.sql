DROP INDEX uq_point_reward_once;

CREATE UNIQUE INDEX uq_point_reward_once ON point_reward(member_id, reason)
    WHERE reason IN ('GROUP_FIRST_MEMBER', 'FIRST_GROUP_JOIN') AND status <> 'SKIPPED';
