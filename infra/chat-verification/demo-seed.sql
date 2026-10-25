BEGIN;
DO $$ BEGIN
    IF current_database() <> 'jarihana_chat_realtime' THEN
        RAISE EXCEPTION 'Demo fixtures require the isolated chat database';
    END IF;
END $$;

INSERT INTO member (id, created_at, updated_at, course, crew_name, generation, github_id, member_type)
VALUES
    (904001, localtimestamp, localtimestamp, 'BACKEND', '하루', 99, 'local-chat-demo-haru', 'CREW'),
    (904002, localtimestamp, localtimestamp, 'FRONTEND', '모아', 99, 'local-chat-demo-moa', 'CREW')
ON CONFLICT (id) DO NOTHING;

INSERT INTO groups (id, created_at, updated_at, description, introduction, name, status, type, meeting_type)
VALUES
    (905001, localtimestamp - interval '2 days', localtimestamp, '점심 메뉴부터 같이 골라요', '편하게 인사하고 점심 약속을 잡아 보세요.', '오늘 점심 같이 먹어요', 'ACTIVE', 'SESSION', 'OFFLINE'),
    (905002, localtimestamp - interval '2 days', localtimestamp, '작게 만들고 같이 배우는 스터디', '공부한 내용과 궁금한 점을 나누는 자리예요.', '리액트 같이 공부해요', 'ACTIVE', 'STUDY', 'ONLINE'),
    (905003, localtimestamp - interval '2 days', localtimestamp, '함께 걸었던 주말의 기록', '종료된 모임의 대화는 읽기만 할 수 있어요.', '주말 산책 모임', 'ENDED', 'CLUB', 'OFFLINE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_member (created_at, updated_at, joined_at, role, group_id, member_id)
SELECT localtimestamp, localtimestamp, localtimestamp,
       CASE WHEN m.id = 904001 THEN 'LEADER' ELSE 'MEMBER' END, g.id, m.id
FROM groups g CROSS JOIN member m
WHERE g.id IN (905001, 905002, 905003)
  AND m.withdrawn_at IS NULL
  AND (m.id IN (904001, 904002) OR m.github_id NOT LIKE 'local-chat-%')
ON CONFLICT (group_id, member_id) DO NOTHING;

INSERT INTO chat_room (group_id, last_sequence)
VALUES (905001, 2), (905002, 2), (905003, 2)
ON CONFLICT (group_id) DO NOTHING;

INSERT INTO chat_message (group_id, sequence, sender_id, client_message_id, content, created_at)
VALUES
    (905001, 1, 904001, '90500100-0000-4000-8000-000000000001', '안녕하세요! 오늘 점심 뭐 먹을까요?', localtimestamp - interval '10 minutes'),
    (905001, 2, 904002, '90500100-0000-4000-8000-000000000002', '저는 국수 좋아요. 같이 가실 분?', localtimestamp - interval '9 minutes'),
    (905002, 1, 904001, '90500200-0000-4000-8000-000000000001', '이번 주에는 상태 관리를 같이 공부해요.', localtimestamp - interval '8 minutes'),
    (905002, 2, 904002, '90500200-0000-4000-8000-000000000002', '좋아요! 궁금한 내용은 여기에 남겨 주세요.', localtimestamp - interval '7 minutes'),
    (905003, 1, 904001, '90500300-0000-4000-8000-000000000001', '오늘 함께 걸어서 좋았어요.', localtimestamp - interval '1 day'),
    (905003, 2, 904002, '90500300-0000-4000-8000-000000000002', '다음에도 또 만나요!', localtimestamp - interval '1 day' + interval '1 minute')
ON CONFLICT (group_id, sequence) DO NOTHING;
COMMIT;
