-- Saved furniture still keeps its physical specification. Interaction rules can
-- change in place, independently of saved room JSON and its revision.
DROP TRIGGER retain_furniture_compatibility ON space_furniture_catalog;

CREATE TRIGGER retain_furniture_compatibility BEFORE UPDATE ON space_furniture_catalog
FOR EACH ROW WHEN (
    NEW.kind <> OLD.kind OR NEW.min_room_version > OLD.min_room_version
    OR (NEW.definition - ARRAY['name', 'category', 'collection', 'interaction']) <>
       (OLD.definition - ARRAY['name', 'category', 'collection', 'interaction'])
) EXECUTE FUNCTION keep_published_furniture_kind();

-- These ceilings count the shipped frontend anchors for each kind.
ALTER TABLE space_furniture_catalog
    ADD COLUMN seat_anchor_count SMALLINT NOT NULL DEFAULT 0 CHECK (seat_anchor_count BETWEEN 0 AND 64),
    ADD COLUMN surface_anchor_count SMALLINT NOT NULL DEFAULT 0 CHECK (surface_anchor_count BETWEEN 0 AND 64);

-- This switch belongs to every scene rather than the saved furniture list.
-- Its catalog entry carries the existing dimensions and is never placeable.
INSERT INTO space_furniture_catalog (kind, display_order, min_room_version, placeable, definition)
SELECT 'room-general-light-switch', MAX(display_order) + 1, 11, false,
       '{"name":"실내 조명 스위치","category":"furniture","width":0.3,"depth":0.3,"height":1.2,"surfaces":[]}'::jsonb
FROM space_furniture_catalog;

DO $$
DECLARE
    interactions CONSTANT jsonb := $interactions$
{
  "sofa": {"capabilities":["seatable"],"seatCount":3},
  "clubSofa": {"capabilities":["seatable"],"seatCount":3},
  "armchair": {"capabilities":["seatable"],"seatCount":1},
  "beanbag": {"capabilities":["seatable"],"seatCount":1},
  "roundChair": {"capabilities":["seatable"],"seatCount":1},
  "bench": {"capabilities":["seatable"],"seatCount":2},
  "stool": {"capabilities":["seatable"],"seatCount":1},
  "gameChair": {"capabilities":["seatable"],"seatCount":1},
  "table": {"capabilities":["surface"],"surface":{"slots":1}},
  "diningTable": {"capabilities":["surface"],"surface":{"slots":1}},
  "feastTable": {"capabilities":["surface"],"surface":{"slots":1}},
  "gameTable": {"capabilities":["surface"],"surface":{"slots":1}},
  "coffeeTable": {"capabilities":["surface"],"surface":{"slots":1}},
  "cafeTable": {"capabilities":["surface"],"surface":{"slots":1}},
  "kitchenIsland": {"capabilities":["surface"],"surface":{"slots":1}},
  "kitchenCounter": {"capabilities":["surface","storage","openable"],"surface":{"slots":3},"storage":{"kinds":["cup","cookie"],"capacity":8}},
  "cafeCounter": {"capabilities":["producer","surface","storage"],"surface":{"slots":1},"storage":{"kinds":["cup"],"capacity":8},"producer":{"kinds":["coffee","latte"],"durationMs":4000}},
  "cafeCabinet": {"capabilities":["producer","surface","storage","openable"],"surface":{"slots":1},"storage":{"kinds":["cup","tea","cookie"],"capacity":8},"producer":{"kinds":["coffee","latte"],"durationMs":4000}},
  "cafeFridge": {"capabilities":["openable","storage"],"storage":{"kinds":["tea","cookie"],"capacity":8}},
  "kitchenFridge": {"capabilities":["openable","storage"],"storage":{"kinds":["tea","cookie"],"capacity":8}},
  "pantryShelf": {"capabilities":["surface","storage"],"surface":{"slots":4},"storage":{"kinds":["cup","tea","cookie"],"capacity":8}},
  "bookshelf": {"capabilities":["surface","storage"],"surface":{"slots":4},"storage":{"kinds":["book"],"capacity":8}},
  "gameShelf": {"capabilities":["storage"],"storage":{"kinds":["book"],"capacity":8}},
  "projectShelf": {"capabilities":["storage"],"storage":{"kinds":["book"],"capacity":8}},
  "libraryShelfWood": {"capabilities":["surface","storage"],"surface":{"slots":1},"storage":{"kinds":["book"],"capacity":8}},
  "libraryShelfDark": {"capabilities":["surface","storage"],"surface":{"slots":1},"storage":{"kinds":["book"],"capacity":8}},
  "libraryShelfDisplay": {"capabilities":["surface","storage"],"surface":{"slots":1},"storage":{"kinds":["book"],"capacity":8}},
  "cameraCabinet": {"capabilities":["surface","storage"],"surface":{"slots":1},"storage":{"kinds":["camera"],"capacity":4}},
  "studyCabinet": {"capabilities":["surface","storage","openable"],"surface":{"slots":1},"storage":{"kinds":["book"],"capacity":8}},
  "studyDesk": {"capabilities":["surface"],"surface":{"slots":1}},
  "focusDesk": {"capabilities":["surface"],"surface":{"slots":1}},
  "photoEditDesk": {"capabilities":["surface"],"surface":{"slots":1}},
  "photoPrintBench": {"capabilities":["surface"],"surface":{"slots":1}},
  "mixingDesk": {"capabilities":["surface"],"surface":{"slots":1}},
  "gameCredenza": {"capabilities":["surface","storage"],"surface":{"slots":1},"storage":{"kinds":["book"],"capacity":8}},
  "longCredenza": {"capabilities":["surface"],"surface":{"slots":1}},
  "openDisplayShelf": {"capabilities":["surface","storage"],"surface":{"slots":5},"storage":{"kinds":["book"],"capacity":8}},
  "worktop": {"capabilities":["surface"],"surface":{"slots":1}},
  "wallShelf": {"capabilities":["surface"],"surface":{"slots":1}},
  "plant": {"capabilities":["careable"],"cooldownMs":30000},
  "leafyPlant": {"capabilities":["careable"],"cooldownMs":30000},
  "propPlant": {"capabilities":["careable"],"cooldownMs":30000},
  "climbingPlant": {"capabilities":["careable"],"cooldownMs":30000},
  "vinePlanter": {"capabilities":["careable"],"cooldownMs":30000},
  "room-general-light-switch": {"capabilities":["switchable"]},
  "floorLamp": {"capabilities":["switchable"]},
  "stageLight": {"capabilities":["switchable"]},
  "clubDashboard": {"capabilities":["panelEntry"],"panel":"dashboard"},
  "activityBoard": {"capabilities":["panelEntry"],"panel":"activities"},
  "musicConsole": {"capabilities":["panelEntry"],"panel":"music"},
  "memory": {"capabilities":["panelEntry"],"panel":"activities"},
  "photoTripod": {"capabilities":["camera"]}
}
$interactions$::jsonb;
BEGIN
    IF EXISTS (
        SELECT FROM jsonb_object_keys(interactions) AS seeded(kind)
        WHERE NOT EXISTS (SELECT FROM space_furniture_catalog WHERE kind = seeded.kind)
    ) THEN
        RAISE EXCEPTION 'An interaction kind is missing from the furniture catalog';
    END IF;
    -- The initial rules use all shipped anchors. Later rules may use fewer.
    UPDATE space_furniture_catalog
    SET definition = jsonb_set(definition, '{interaction}', seed.rules),
        seat_anchor_count = COALESCE((seed.rules->>'seatCount')::smallint, 0),
        surface_anchor_count = COALESCE((seed.rules #>> '{surface,slots}')::smallint, 0)
    FROM jsonb_each(interactions) AS seed(kind, rules)
    WHERE space_furniture_catalog.kind = seed.kind;
END
$$;

ALTER TABLE space_furniture_catalog
    ADD CONSTRAINT room_light_switch_not_placeable CHECK (kind <> 'room-general-light-switch' OR NOT placeable),
    ADD CONSTRAINT space_furniture_interaction_shape CHECK ((
        NOT (definition ? 'interaction') OR (
            jsonb_typeof(definition->'interaction') = 'object'
            AND jsonb_typeof(definition #> '{interaction,capabilities}') = 'array'
            AND NOT jsonb_path_exists(definition, 'strict $.interaction.capabilities[*] ? (
                @.type() != "string" || (
                    @ != "seatable" && @ != "surface" && @ != "storage" && @ != "openable" &&
                    @ != "producer" && @ != "careable" && @ != "switchable" && @ != "panelEntry" && @ != "camera"
                )
            )', '{}', true)
            AND (definition #> '{interaction,capabilities}' ? 'seatable') = (definition->'interaction' ? 'seatCount')
            AND (NOT (definition->'interaction' ? 'seatCount') OR (
                jsonb_path_exists(definition, 'strict $.interaction.seatCount ? (
                    @.type() == "number" && @ >= 1 && @ <= $anchors && @ % 1 == 0
                )', jsonb_build_object('anchors', seat_anchor_count), true)
            ))
            AND (definition #> '{interaction,capabilities}' ? 'surface') = (definition->'interaction' ? 'surface')
            AND (NOT (definition->'interaction' ? 'surface') OR (
                jsonb_path_exists(definition, 'strict $.interaction.surface.slots ? (
                    @.type() == "number" && @ >= 1 && @ <= $anchors && @ % 1 == 0
                )', jsonb_build_object('anchors', surface_anchor_count), true)
            ))
            AND (definition #> '{interaction,capabilities}' ? 'storage') = (definition->'interaction' ? 'storage')
            AND (NOT (definition->'interaction' ? 'storage') OR (
                jsonb_path_exists(definition, 'strict $.interaction.storage.capacity ? (
                    @.type() == "number" && @ >= 1 && @ <= 64 && @ % 1 == 0
                )', '{}', true)
                AND jsonb_typeof(definition #> '{interaction,storage,kinds}') = 'array'
                AND NOT jsonb_path_exists(definition, 'strict $.interaction.storage.kinds[*] ? (
                    @.type() != "string" || @ == ""
                )', '{}', true)
            ))
            AND (definition #> '{interaction,capabilities}' ? 'producer') = (definition->'interaction' ? 'producer')
            AND (NOT (definition->'interaction' ? 'producer') OR (
                jsonb_path_exists(definition, 'strict $.interaction.producer.durationMs ? (
                    @.type() == "number" && @ >= 1 && @ <= 2147483647 && @ % 1 == 0
                )', '{}', true)
                AND jsonb_typeof(definition #> '{interaction,producer,kinds}') = 'array'
                AND NOT jsonb_path_exists(definition, 'strict $.interaction.producer.kinds[*] ? (
                    @.type() != "string" || @ == ""
                )', '{}', true)
                AND (definition #> '{interaction,capabilities}' ? 'surface')
            ))
            AND (definition #> '{interaction,capabilities}' ? 'careable') = (definition->'interaction' ? 'cooldownMs')
            AND (NOT (definition->'interaction' ? 'cooldownMs') OR (
                jsonb_path_exists(definition, 'strict $.interaction.cooldownMs ? (
                    @.type() == "number" && @ >= 1 && @ <= 2147483647 && @ % 1 == 0
                )', '{}', true)
            ))
            AND (definition #> '{interaction,capabilities}' ? 'panelEntry') = (definition->'interaction' ? 'panel')
            AND (NOT (definition->'interaction' ? 'panel') OR
                definition #>> '{interaction,panel}' IN ('dashboard', 'activities', 'music'))
        )
    ) IS TRUE);

CREATE TABLE space_furniture_catalog_migration (
    version INTEGER PRIMARY KEY CHECK (version = 1)
);

-- Grant only the extra columns needed by prior explicit furniture readers.
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
        EXECUTE format('GRANT SELECT (placeable) ON space_furniture_catalog TO %I', reader.grantee);
        EXECUTE format('GRANT SELECT (version) ON space_furniture_catalog_migration TO %I', reader.grantee);
    END LOOP;
END
$$;

INSERT INTO space_furniture_catalog_migration (version) VALUES (1);
