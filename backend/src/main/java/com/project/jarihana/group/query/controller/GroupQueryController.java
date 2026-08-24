package com.project.jarihana.group.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.group.query.controller.dto.GroupDetailResponse;
import com.project.jarihana.group.query.controller.dto.GroupListRequest;
import com.project.jarihana.group.query.controller.dto.GroupListResponse;
import com.project.jarihana.group.query.service.GroupQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/groups")
public class GroupQueryController {

    private final GroupQueryService groupQueryService;

    public GroupQueryController(GroupQueryService groupQueryService) {
        this.groupQueryService = groupQueryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<GroupListResponse>> findGroups(
            @Validated @ModelAttribute GroupListRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                GroupListResponse.from(groupQueryService.findGroups(request.toQuery()))
        ));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupDetailResponse>> findGroup(
            @PathVariable Long groupId
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                GroupDetailResponse.from(groupQueryService.findGroup(groupId))
        ));
    }
}
