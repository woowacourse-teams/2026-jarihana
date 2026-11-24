package com.project.jarihana.groupspace.query.repository;

import com.project.jarihana.groupspace.domain.FurnitureType;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Repository
@RequiredArgsConstructor
public class FurnitureCatalogRepository {
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public List<FurnitureType> findAll() {
        return jdbc.sql("""
                SELECT kind, min_room_version, placeable, definition
                FROM space_furniture_catalog ORDER BY display_order
                """).query((row, index) -> new FurnitureType(row.getString("kind"),
                        row.getInt("min_room_version"), row.getBoolean("placeable"),
                        (ObjectNode) mapper.readTree(row.getString("definition")))).list();
    }

    public Snapshot findSnapshot() {
        return jdbc.sql("""
                SELECT interactions.version AS interaction_version, portable.version AS portable_version,
                       (SELECT COALESCE(jsonb_agg(definition || jsonb_build_object(
                               'kind', kind, 'placeable', placeable, 'minRoomVersion', min_room_version
                           ) ORDER BY display_order), '[]'::jsonb) FROM space_furniture_catalog) AS items,
                       (SELECT COALESCE(jsonb_object_agg(kind, definition), '{}'::jsonb)
                           FROM space_portable_item_catalog) AS portable_items
                FROM space_furniture_catalog_migration AS interactions
                CROSS JOIN space_portable_item_catalog_migration AS portable
                """).query((row, index) -> new Snapshot(row.getInt("interaction_version"),
                (ArrayNode) mapper.readTree(row.getString("items")), row.getInt("portable_version"),
                (ObjectNode) mapper.readTree(row.getString("portable_items")))).single();
    }

    public record Snapshot(int interactionCatalogVersion, ArrayNode items, int portableCatalogVersion, ObjectNode portableItems) {
    }
}
