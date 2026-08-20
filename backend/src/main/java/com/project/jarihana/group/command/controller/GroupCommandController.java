package com.project.jarihana.group.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.group.command.controller.dto.CreateGroupRequest;
import com.project.jarihana.group.command.controller.dto.CreateGroupResponse;
import com.project.jarihana.group.command.controller.dto.ModifyGroupRequest;
import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.query.controller.dto.GroupDetailResponse;
import com.project.jarihana.group.query.service.GroupQueryService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/groups")
public class GroupCommandController {

    private final GroupCommandService groupCommandService;
    private final GroupQueryService groupQueryService;

    public GroupCommandController(GroupCommandService groupCommandService, GroupQueryService groupQueryService) {
        this.groupCommandService = groupCommandService;
        this.groupQueryService = groupQueryService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CreateGroupResponse>> createGroup(
            @LoginMember Long memberId,
            @Valid @RequestBody CreateGroupRequest request
    ) {
        CreateGroupResponse response = CreateGroupResponse.from(
                groupCommandService.createGroup(memberId, request.toCommand())
        );
        return ResponseEntity.created(URI.create("/api/groups/" + response.id()))
                .body(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupDetailResponse>> modifyGroup(
            @LoginMember Long memberId,
            @PathVariable Long groupId,
            @Valid @RequestBody ModifyGroupRequest request
    ) {
        groupCommandService.modifyGroup(memberId, groupId, request.toCommand());
        return ResponseEntity.ok(ApiResponse.success(
                GroupDetailResponse.from(groupQueryService.findGroup(groupId))
        ));
    }
}
