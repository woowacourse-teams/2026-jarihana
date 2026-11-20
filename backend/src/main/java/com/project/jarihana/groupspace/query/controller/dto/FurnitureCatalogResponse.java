package com.project.jarihana.groupspace.query.controller.dto;

import com.project.jarihana.groupspace.domain.FurnitureType;
import java.util.List;
import tools.jackson.databind.node.ObjectNode;

public record FurnitureCatalogResponse(List<ObjectNode> items) {
    public static FurnitureCatalogResponse from(List<FurnitureType> catalog) {
        return new FurnitureCatalogResponse(catalog.stream()
                .map(type -> type.definition().deepCopy().put("kind", type.kind())
                        .put("placeable", type.placeable()).put("minRoomVersion", type.minRoomVersion()))
                .toList());
    }
}
