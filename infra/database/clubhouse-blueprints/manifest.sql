CREATE TEMP TABLE clubhouse_expected_blueprint AS
SELECT published."templateKey" AS template_key,
       published."blueprintVersion" AS blueprint_version,
       published."geometrySchemaVersion" AS geometry_schema_version,
       published.geometry,
       published.spawn,
       published."defaultRoom" AS default_room
FROM pg_temp.clubhouse_blueprint_snapshot snapshot
CROSS JOIN LATERAL jsonb_to_recordset(snapshot.payload) AS published (
    "templateKey" text,
    "blueprintVersion" integer,
    "geometrySchemaVersion" integer,
    geometry jsonb,
    spawn jsonb,
    "defaultRoom" jsonb
);

ALTER TABLE pg_temp.clubhouse_expected_blueprint
    ADD PRIMARY KEY (template_key, blueprint_version);
