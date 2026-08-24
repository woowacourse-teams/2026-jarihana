package com.project.jarihana.groupmember.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.groupmember.command.controller.dto.TransferLeaderRequest;
import com.project.jarihana.groupmember.command.controller.dto.TransferLeaderResponse;
import com.project.jarihana.groupmember.command.service.GroupMemberCommandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/groups")
@RequiredArgsConstructor
public class GroupMemberCommandController {

    private final GroupMemberCommandService groupMemberCommandService;

    @PutMapping("/{groupId}/leader")
    public ResponseEntity<ApiResponse<TransferLeaderResponse>> transferLeader(
            @LoginMember long memberId,
            @PathVariable long groupId,
            @Valid @RequestBody TransferLeaderRequest request
    ) {
        TransferLeaderResponse response = TransferLeaderResponse.from(
                groupMemberCommandService.transferLeader(memberId, groupId, request.toCommand())
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
