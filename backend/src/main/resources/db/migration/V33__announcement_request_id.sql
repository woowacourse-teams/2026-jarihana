ALTER TABLE announcements ADD COLUMN request_id uuid;

CREATE UNIQUE INDEX uq_announcement_request
    ON announcements(group_id, author_member_id, request_id)
    WHERE request_id IS NOT NULL;
