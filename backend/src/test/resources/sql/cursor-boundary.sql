-- 커서 경계 회귀 테스트 픽스처
-- 목록마다 식별자 b+1~b+5 다섯 행을 둔다. 정렬 시각은 b+1이 가장 늦고, b+2~b+4가 같으며, b+5가 가장 이르다.
-- 그래서 내림차순은 b+1, b+4, b+3, b+2, b+5이고, 크기 2로 나누면 같은 시각 행 사이에서 페이지가 끊긴다.
CREATE TEMPORARY TABLE cursor_slot (n integer PRIMARY KEY, at timestamp NOT NULL) ON COMMIT DROP;
INSERT INTO cursor_slot (n, at)
VALUES (1, '2026-08-19 11:00:00'),
       (2, '2026-08-19 10:00:00'),
       (3, '2026-08-19 10:00:00'),
       (4, '2026-08-19 10:00:00'),
       (5, '2026-08-19 09:00:00');

-- 회원 1~5는 초대 후보 목록의 대상이고, 회원 6은 후보를 찾는 모임장이다.
INSERT INTO member (id, created_at, updated_at, course, crew_name, generation, github_id, member_type)
SELECT n, at, at, 'BACKEND', 'cb' || n, 8, 'cursor-boundary-' || n, 'CREW' FROM cursor_slot;
INSERT INTO member (id, created_at, updated_at, course, crew_name, generation, github_id, member_type)
VALUES (6, '2026-08-18 10:00:00', '2026-08-18 10:00:00', 'BACKEND', 'cb6', 8, 'cursor-boundary-6', 'CREW');

-- 모임 1~5는 모임 목록 대상이다. 다른 목록은 모임 1에 속하고, 모임 2는 회원 6만 속한다.
INSERT INTO groups (id, created_at, updated_at, introduction, name, status, type, meeting_type)
SELECT n, at, at, '커서 경계', '커서 경계 모임 ' || n, 'ACTIVE', 'STUDY', 'OFFLINE' FROM cursor_slot;

INSERT INTO group_member (id, created_at, updated_at, joined_at, role, group_id, member_id)
SELECT n, at, at, at, CASE WHEN n = 1 THEN 'LEADER' ELSE 'MEMBER' END, 1, n FROM cursor_slot;
INSERT INTO group_member (id, created_at, updated_at, joined_at, role, group_id, member_id)
VALUES (6, '2026-08-18 10:00:00', '2026-08-18 10:00:00', '2026-08-18 10:00:00', 'LEADER', 2, 6);

-- 모집 1~5는 모임 1의 모집 목록 대상이고, 모집 6은 회원 6의 내 신청 목록을 다섯 개로 맞추기 위한 것이다.
INSERT INTO group_recruitment (id, created_at, updated_at, capacity, ends_at, join_method, starts_at, group_id)
SELECT n, at, at, 10, NULL, 'APPROVAL', at, 1 FROM cursor_slot;
INSERT INTO group_recruitment (id, created_at, updated_at, capacity, ends_at, join_method, starts_at, group_id)
VALUES (6, '2026-08-18 10:00:00', '2026-08-18 10:00:00', 10, NULL, 'APPROVAL', '2026-08-18 10:00:00', 2);

-- 신청 1~5는 모집 1의 신청자 목록, 신청 11~15는 회원 6의 내 신청 목록 대상이다.
INSERT INTO registration (id, created_at, updated_at, registered_at, status, member_id, recruitment_id)
SELECT n, at, at, at, 'PENDING', n, 1 FROM cursor_slot;
INSERT INTO registration (id, created_at, updated_at, registered_at, status, member_id, recruitment_id)
SELECT 10 + n, at, at, at, 'PENDING', 6, n + 1 FROM cursor_slot;

-- 활동 기록 피드는 활동 날짜로 정렬하므로 같은 규칙을 날짜에 적용한다.
INSERT INTO activity_post (id, group_id, author_member_id, caption, activity_date, created_at, updated_at)
SELECT n, 1, 1, '커서 경계', at::date + CASE n WHEN 1 THEN 1 WHEN 5 THEN -1 ELSE 0 END, at, at FROM cursor_slot;
INSERT INTO activity_post_photo (id, activity_post_id, image_key)
SELECT n, n, 'cursor-boundary/' || n FROM cursor_slot;

INSERT INTO activity_post_comment (id, activity_post_id, author_member_id, content, created_at, updated_at)
SELECT n, 1, 1, '커서 경계 댓글 ' || n, at, at FROM cursor_slot;
INSERT INTO activity_post_reaction (id, activity_post_id, member_id, emoji, created_at, updated_at)
SELECT n, 1, n, 'HEART', at, at FROM cursor_slot;
INSERT INTO activity_post_comment_reaction (id, activity_post_comment_id, member_id, emoji, created_at, updated_at)
SELECT n, 1, n, 'HEART', at, at FROM cursor_slot;

INSERT INTO announcements (id, group_id, author_member_id, title, content, scope, created_at, updated_at)
SELECT n, 1, 1, '커서 경계 공지 ' || n, '내용', 'PUBLIC', at, at FROM cursor_slot;

-- 초대 1~5는 회원 6이 모임 2에서 보낸 직접 초대, 초대 11~15는 회원 6이 모임 1에서 받은 직접 초대다.
INSERT INTO invitation (id, group_id, inviter_member_id, target_member_id, type, request_id, created_at, updated_at)
SELECT n, 2, 6, n, 'DIRECT', md5('cursor-issued-' || n)::uuid, at, at FROM cursor_slot;
INSERT INTO invitation (id, group_id, inviter_member_id, target_member_id, type, request_id, created_at, updated_at)
SELECT 10 + n, 1, n, 6, 'DIRECT', md5('cursor-received-' || n)::uuid, at, at FROM cursor_slot;

INSERT INTO proposal (id, author_member_id, category, title, content, mood_options, created_at, updated_at)
SELECT n, 1, 'STUDY', '커서 경계 제안 ' || n, '내용', '', at, at FROM cursor_slot;
INSERT INTO proposal_comment (id, proposal_id, author_member_id, content, created_at, updated_at)
SELECT n, 1, 1, '커서 경계 제안 댓글 ' || n, at, at FROM cursor_slot;

INSERT INTO push_subscriptions (id, member_id, endpoint, p256dh, auth, enabled, generation, last_seen_at,
                                created_at, updated_at)
SELECT n, 1, 'https://push.example.test/cursor-boundary/' || n, 'p256dh', 'auth', true, 1, at, at, at
FROM cursor_slot;

INSERT INTO notifications (id, member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
SELECT n, 1, 'cursor-boundary:' || n, 'GROUP_CREATED', 1, '{"groupId": 1}'::jsonb, at, at FROM cursor_slot;

INSERT INTO sparring_topic (id, title, claim_a, claim_b, description, revision, creator_id, created_at, updated_at)
SELECT n, '커서 경계 토론 ' || n, '찬성', '반대', '설명', 1, 1, at, at FROM cursor_slot;

-- 오목 기록은 회원 1과 회원 2가 둔 무승부 다섯 판이며, 종료 시각으로 정렬한다.
INSERT INTO gomoku_room (id, created_at, updated_at, touched_at, host_member_id, host_name, guest_member_id,
                         guest_name, visibility, rule, status, host_ready, guest_ready, game_number,
                         black_member_id, board, ply, revision)
VALUES (1, '2026-08-19 08:00:00', '2026-08-19 08:00:00', '2026-08-19 08:00:00', 1, 'cb1', 2, 'cb2', 'PUBLIC',
        'RENJU', 'WAITING', false, false, 5, 1, repeat('0', 225), 0, 1);
INSERT INTO gomoku_game (id, created_at, updated_at, room_id, game_number, host_member_id, guest_member_id,
                         host_name, guest_name, black_member_id, rule, end_reason, ply, ended_at)
SELECT n, at, at, 1, n, 1, 2, 'cb1', 'cb2', 1, 'RENJU', 'DRAW', 0, at FROM cursor_slot;
