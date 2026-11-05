-- Preserve the existing white sneakers for stored avatars and older application INSERTs.
ALTER TABLE member_avatar
    ADD COLUMN shoes VARCHAR(16) NOT NULL DEFAULT 'sneakers'
        CHECK (shoes IN ('sneakers', 'slipOn', 'highTop')),
    ADD COLUMN shoe_color VARCHAR(16) NOT NULL DEFAULT 'white'
        CHECK (shoe_color IN ('white', 'ink', 'mint', 'coral'));
