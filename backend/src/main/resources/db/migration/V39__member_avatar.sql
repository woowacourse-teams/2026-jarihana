-- Additive, optional settings: existing members and older application versions need no backfill.
CREATE TABLE member_avatar (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    hair VARCHAR(16) NOT NULL,
    skin VARCHAR(16) NOT NULL,
    hair_color VARCHAR(16) NOT NULL,
    face VARCHAR(16) NOT NULL,
    eyes VARCHAR(16) NOT NULL,
    eyebrows VARCHAR(16) NOT NULL,
    nose VARCHAR(16) NOT NULL,
    mouth VARCHAR(16) NOT NULL,
    glasses VARCHAR(16) NOT NULL,
    outfit VARCHAR(16) NOT NULL,
    shoes VARCHAR(16) NOT NULL,
    shoe_color VARCHAR(16) NOT NULL,
    hat VARCHAR(16) NOT NULL,
    hat_color VARCHAR(16) NOT NULL,
    bag VARCHAR(16) NOT NULL,
    bag_color VARCHAR(16) NOT NULL,
    handheld VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
