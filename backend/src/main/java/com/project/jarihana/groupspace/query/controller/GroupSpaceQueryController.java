package com.project.jarihana.groupspace.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupspace.query.controller.dto.FurnitureCatalogResponse;
import com.project.jarihana.groupspace.query.controller.dto.GroupSpaceResponse;
import com.project.jarihana.groupspace.query.controller.dto.SpaceBlueprintResponse;
import com.project.jarihana.groupspace.query.service.GroupSpaceQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GroupSpaceQueryController {
    private final GroupSpaceQueryService service;

    @GetMapping("/group-spaces/furniture-catalog")
    public ResponseEntity<ApiResponse<FurnitureCatalogResponse>> findFurnitureCatalog() {
        return ResponseEntity.ok(ApiResponse.success(FurnitureCatalogResponse.from(service.findFurnitureCatalog())));
    }

    @GetMapping("/group-spaces/blueprints/{templateKey}/default")
    public ResponseEntity<ApiResponse<SpaceBlueprintResponse>> findDefaultBlueprint(@PathVariable String templateKey) {
        return ResponseEntity.ok(ApiResponse.success(SpaceBlueprintResponse.from(service.findDefaultBlueprint(templateKey))));
    }

    @GetMapping("/groups/{groupId}/space")
    public ResponseEntity<ApiResponse<GroupSpaceResponse>> findGroupSpace(@PathVariable long groupId) {
        return ResponseEntity.ok(ApiResponse.success(GroupSpaceResponse.from(service.findGroupSpace(groupId))));
    }
}
