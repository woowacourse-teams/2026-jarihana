package com.project.jarihana.group.command.controller;

import com.project.jarihana.auth.annotation.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.group.command.controller.dto.CreateGroupRequest;
import com.project.jarihana.group.command.controller.dto.CreateGroupResponse;
import com.project.jarihana.group.command.service.GroupCommandService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/groups")
public class GroupCommandController {

    private final GroupCommandService groupCommandService;

    public GroupCommandController(GroupCommandService groupCommandService) {
        this.groupCommandService = groupCommandService;
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
}
