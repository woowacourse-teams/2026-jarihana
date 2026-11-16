-- Additive and independent of #589 migrations. point_wallet remains owned by the points module.
-- No production offers are seeded: example avatar parts remain free.
CREATE TABLE shop_product (
    id varchar(64) PRIMARY KEY,
    definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
    available boolean NOT NULL DEFAULT false,
    created_at timestamp(6) NOT NULL DEFAULT LOCALTIMESTAMP,
    CHECK (definition ?& ARRAY['name', 'description', 'categoryId', 'price', 'preview', 'grant']),
    CHECK (jsonb_typeof(definition->'price') = 'number'),
    CHECK ((definition->>'price')::numeric BETWEEN 1 AND 9007199254740991),
    CHECK ((definition->>'price')::numeric = trunc((definition->>'price')::numeric)),
    CHECK (length(definition->'grant'->>'itemId') BETWEEN 1 AND 64)
);

-- A completed purchase is both the debit ledger entry and the permanent item entitlement.
CREATE TABLE shop_purchase (
    id uuid PRIMARY KEY,
    member_id bigint NOT NULL REFERENCES member(id),
    request_id uuid NOT NULL,
    product_id varchar(64) NOT NULL REFERENCES shop_product(id),
    terms_version varchar(64) NOT NULL,
    amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
    item_id varchar(64) NOT NULL,
    item_snapshot jsonb NOT NULL,
    created_at timestamp(6) NOT NULL,
    UNIQUE (member_id, request_id),
    UNIQUE (member_id, item_id)
);
