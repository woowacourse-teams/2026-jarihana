DO $$ BEGIN
    IF current_database() <> 'jarihana_chat_realtime' THEN
        RAISE EXCEPTION 'This fixture requires jarihana_chat_realtime';
    END IF;
END $$;

INSERT INTO member (id, created_at, updated_at, course, crew_name, generation, github_id, member_type)
SELECT 901000 + n, localtimestamp, localtimestamp, 'BACKEND',
       CASE n WHEN 1 THEN '모닥' WHEN 2 THEN '두리' ELSE '시험' || chr(44032 + n) END,
       99, 'local-chat-fixture-' || n, 'CREW'
FROM generate_series(1, 105) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO groups (id, created_at, updated_at, description, introduction, name, status, type, meeting_type)
SELECT 902000 + n, localtimestamp, localtimestamp, '격리된 로컬 채팅 검증 모임',
       '채팅 전달과 복구를 확인해요', '채팅 검증 모임 ' || n, 'ACTIVE', 'STUDY', 'ONLINE'
FROM generate_series(1, 10) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_member (created_at, updated_at, joined_at, role, group_id, member_id)
SELECT localtimestamp, localtimestamp, localtimestamp,
       CASE m WHEN 1 THEN 'LEADER' ELSE 'MEMBER' END, 902000 + g, 901000 + m
FROM generate_series(1, 10) AS g CROSS JOIN generate_series(1, 100) AS m
ON CONFLICT (group_id, member_id) DO NOTHING;
