-- Existing avatars and older INSERTs retain no bag and empty hands.
ALTER TABLE member_avatar
    ADD COLUMN bag VARCHAR(16) NOT NULL DEFAULT 'none'
        CHECK (bag IN ('none', 'backpack', 'crossbody', 'shoulder')),
    ADD COLUMN bag_color VARCHAR(16) NOT NULL DEFAULT 'ink'
        CHECK (bag_color IN ('ink', 'cream', 'mint', 'coral', 'navy')),
    ADD COLUMN handheld VARCHAR(16) NOT NULL DEFAULT 'none'
        CHECK (handheld IN ('none', 'hotCoffee', 'icedCoffee', 'book', 'laptop', 'phone'));
