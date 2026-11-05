-- Older INSERTs keep an uncovered head; existing avatar settings remain intact.
ALTER TABLE member_avatar
    ADD COLUMN hat VARCHAR(16) NOT NULL DEFAULT 'none'
        CHECK (hat IN ('none', 'cap', 'bucket', 'beanie', 'beret')),
    ADD COLUMN hat_color VARCHAR(16) NOT NULL DEFAULT 'ink'
        CHECK (hat_color IN ('ink', 'cream', 'mint', 'coral', 'navy'));

ALTER TABLE member_avatar DROP CONSTRAINT member_avatar_glasses_check;
ALTER TABLE member_avatar ADD CONSTRAINT member_avatar_glasses_check
    CHECK (glasses IN ('none', 'round', 'square', 'sunglasses'));
