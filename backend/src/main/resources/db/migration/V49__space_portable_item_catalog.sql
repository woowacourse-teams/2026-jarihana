CREATE TABLE space_portable_item_catalog (
    kind TEXT PRIMARY KEY CHECK (length(kind) BETWEEN 1 AND 64),
    definition JSONB NOT NULL,
    empty_kind TEXT GENERATED ALWAYS AS (definition->>'emptyKind') STORED,
    CONSTRAINT portable_item_empty_kind_fk FOREIGN KEY (empty_kind) REFERENCES space_portable_item_catalog(kind),
    CONSTRAINT space_portable_item_shape CHECK ((
        jsonb_typeof(definition) = 'object'
        AND jsonb_typeof(definition->'portable') = 'boolean'
        AND jsonb_typeof(definition->'throwable') = 'boolean'
        AND jsonb_typeof(definition->'consumable') = 'boolean'
        AND (NOT (definition ? 'camera') OR jsonb_typeof(definition->'camera') = 'boolean')
        AND (NOT (definition ? 'emptyKind') OR (
            jsonb_typeof(definition->'emptyKind') = 'string' AND length(empty_kind) BETWEEN 1 AND 64
        ))
    ) IS TRUE)
);

CREATE INDEX space_portable_item_empty_kind_idx ON space_portable_item_catalog (empty_kind) WHERE empty_kind IS NOT NULL;

INSERT INTO space_portable_item_catalog (kind, definition)
SELECT kind, definition FROM jsonb_each($portable_items$
{
  "cup": {"portable":true,"throwable":true,"consumable":false},
  "coffee": {"portable":true,"throwable":true,"consumable":true,"emptyKind":"cup"},
  "latte": {"portable":true,"throwable":true,"consumable":true,"emptyKind":"cup"},
  "tea": {"portable":true,"throwable":true,"consumable":true,"emptyKind":"cup"},
  "cookie": {"portable":true,"throwable":true,"consumable":true},
  "book": {"portable":true,"throwable":false,"consumable":false},
  "camera": {"portable":true,"throwable":false,"consumable":false,"camera":true}
}
$portable_items$::jsonb) AS portable(kind, definition);

-- Foreign keys serialize portable kind removal with concurrent furniture writes.
-- Only the trigger maintains these reference rows after the initial backfill.
CREATE TABLE space_furniture_portable_item_reference (
    furniture_kind VARCHAR(64) REFERENCES space_furniture_catalog(kind) ON DELETE CASCADE,
    portable_kind TEXT,
    PRIMARY KEY (furniture_kind, portable_kind),
    CONSTRAINT furniture_portable_item_kind_fk FOREIGN KEY (portable_kind) REFERENCES space_portable_item_catalog(kind)
);

CREATE INDEX space_furniture_portable_kind_idx ON space_furniture_portable_item_reference (portable_kind);

CREATE FUNCTION space_furniture_portable_kinds(definition JSONB)
RETURNS SETOF TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
    SELECT DISTINCT kind FROM jsonb_array_elements_text(
        COALESCE(definition #> '{interaction,storage,kinds}', '[]'::jsonb) ||
        COALESCE(definition #> '{interaction,producer,kinds}', '[]'::jsonb)
    ) AS kinds(kind)
$$;

INSERT INTO space_furniture_portable_item_reference (furniture_kind, portable_kind)
SELECT furniture.kind, portable.kind
FROM space_furniture_catalog AS furniture
CROSS JOIN LATERAL space_furniture_portable_kinds(furniture.definition) AS portable(kind);

CREATE FUNCTION sync_space_furniture_portable_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    EXECUTE format('DELETE FROM %1$I.space_furniture_portable_item_reference AS existing
        WHERE furniture_kind = $1 AND NOT EXISTS (
            SELECT FROM %1$I.space_furniture_portable_kinds($2) AS portable(kind) WHERE kind = existing.portable_kind
        )', TG_TABLE_SCHEMA)
    USING NEW.kind, NEW.definition;
    EXECUTE format('INSERT INTO %1$I.space_furniture_portable_item_reference (furniture_kind, portable_kind)
        SELECT $1, kind FROM %1$I.space_furniture_portable_kinds($2) AS portable(kind)
        ON CONFLICT DO NOTHING', TG_TABLE_SCHEMA)
    USING NEW.kind, NEW.definition;
    RETURN NEW;
END
$$;

CREATE TRIGGER sync_space_furniture_portable_references
AFTER INSERT OR UPDATE OF definition ON space_furniture_catalog
FOR EACH ROW EXECUTE FUNCTION sync_space_furniture_portable_references();

REVOKE ALL ON FUNCTION sync_space_furniture_portable_references() FROM PUBLIC;

CREATE TABLE space_portable_item_catalog_migration (
    version INTEGER PRIMARY KEY CHECK (version = 1)
);

DO $$
DECLARE
    reader RECORD;
BEGIN
    FOR reader IN
        SELECT DISTINCT grantee FROM information_schema.column_privileges
        WHERE table_schema = current_schema() AND table_name = 'space_furniture_catalog'
            AND column_name = 'definition' AND privilege_type = 'SELECT'
            AND grantee NOT IN ('PUBLIC', current_user)
    LOOP
        EXECUTE format('GRANT SELECT (kind, definition) ON space_portable_item_catalog TO %I', reader.grantee);
        EXECUTE format('GRANT SELECT (version) ON space_portable_item_catalog_migration TO %I', reader.grantee);
    END LOOP;
END
$$;

INSERT INTO space_portable_item_catalog_migration (version) VALUES (1);
