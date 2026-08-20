package com.project.jarihana.groupmember.query.controller;

import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupmember.query.controller.dto.GroupMemberListRequest;
import com.project.jarihana.groupmember.query.controller.dto.GroupMemberListResponse;
import com.project.jarihana.groupmember.query.service.GroupMemberQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/groups/{groupId}/members")
public class GroupMemberQueryController {

    private final GroupMemberQueryService groupMemberQueryService;

    public GroupMemberQueryController(GroupMemberQueryService groupMemberQueryService) {
        this.groupMemberQueryService = groupMemberQueryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<GroupMemberListResponse>> findGroupMembers(
            @PathVariable Long groupId,
            @Validated @ModelAttribute GroupMemberListRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                GroupMemberListResponse.from(
                        groupMemberQueryService.findGroupMembers(groupId, request.toQuery())
                )
        ));
    }
}
