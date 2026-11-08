-- #589 (614760b) owns this production table. Until it lands, exercise its exact wallet contract.
CREATE TABLE IF NOT EXISTS point_wallet (
    member_id bigint PRIMARY KEY REFERENCES member(id),
    balance bigint NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 9007199254740991)
);
