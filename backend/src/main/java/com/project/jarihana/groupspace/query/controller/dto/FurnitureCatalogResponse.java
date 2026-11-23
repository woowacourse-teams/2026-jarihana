package com.project.jarihana.groupspace.query.controller.dto;

import com.project.jarihana.groupspace.query.repository.FurnitureCatalogRepository;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

public record FurnitureCatalogResponse(int interactionCatalogVersion, ArrayNode items,
                                       int portableCatalogVersion, ObjectNode portableItems) {
    public static FurnitureCatalogResponse from(FurnitureCatalogRepository.Snapshot catalog) {
        return new FurnitureCatalogResponse(catalog.interactionCatalogVersion(), catalog.items(),
                catalog.portableCatalogVersion(), catalog.portableItems());
    }
}
