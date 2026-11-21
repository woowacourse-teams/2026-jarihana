package com.project.jarihana.groupspace.query.repository;

import com.project.jarihana.groupspace.domain.FurnitureType;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;
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
}
