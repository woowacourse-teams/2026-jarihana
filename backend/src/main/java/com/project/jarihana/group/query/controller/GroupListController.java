package com.project.jarihana.group.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.group.query.controller.dto.GroupListRequest;
import com.project.jarihana.group.query.controller.dto.GroupListResponse;
import com.project.jarihana.group.query.service.GroupListService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

@RestController
@RequestMapping("/api/groups")
public class GroupListController {

    private final GroupListService groupListService;

    public GroupListController(GroupListService groupListService) {
        this.groupListService = groupListService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<GroupListResponse>> findGroups(
            @Validated @ModelAttribute GroupListRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                GroupListResponse.from(groupListService.findGroups(request.toQuery()))
        ));
    }
}
