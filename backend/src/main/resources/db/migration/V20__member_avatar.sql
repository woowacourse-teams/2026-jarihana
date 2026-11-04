-- Additive, optional settings: existing members and older application versions need no backfill.
CREATE TABLE member_avatar (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version = 1),
    hair VARCHAR(16) NOT NULL CHECK (hair IN ('curly', 'parted', 'bob', 'long', 'flowing', 'bald')),
    skin VARCHAR(16) NOT NULL CHECK (skin IN ('pearl', 'warm', 'tan', 'deep')),
    hair_color VARCHAR(16) NOT NULL CHECK (hair_color IN ('ink', 'chestnut', 'copper', 'silver')),
    face VARCHAR(16) NOT NULL CHECK (face IN ('round', 'oval', 'wide')),
    eyes VARCHAR(16) NOT NULL CHECK (eyes IN ('round', 'slim', 'dot')),
    eyebrows VARCHAR(16) NOT NULL CHECK (eyebrows IN ('arched', 'straight', 'bold')),
    nose VARCHAR(16) NOT NULL CHECK (nose IN ('round', 'small', 'wide')),
    mouth VARCHAR(16) NOT NULL CHECK (mouth IN ('smile', 'flat', 'open')),
    glasses VARCHAR(16) NOT NULL CHECK (glasses IN ('none', 'round', 'square')),
    outfit VARCHAR(16) NOT NULL CHECK (outfit IN ('mint', 'coral', 'cream', 'navy', 'lilac', 'ochre')),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
