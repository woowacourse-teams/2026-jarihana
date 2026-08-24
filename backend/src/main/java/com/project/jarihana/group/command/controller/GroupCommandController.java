package com.project.jarihana.group.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.group.command.controller.dto.*;
import com.project.jarihana.group.command.service.GroupCommandService;
import com.project.jarihana.group.query.controller.dto.GroupDetailResponse;
import com.project.jarihana.group.query.service.GroupQueryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

@RestController
@RequestMapping("/groups")
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
        return ResponseEntity.created(URI.create("/groups/" + response.id()))
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

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Void> deleteGroup(
            @LoginMember Long memberId,
            @PathVariable Long groupId
    ) {
        groupCommandService.deleteGroup(memberId, groupId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{groupId}")
    public ResponseEntity<ApiResponse<TerminateGroupResponse>> terminateGroup(
            @LoginMember Long memberId,
            @PathVariable Long groupId,
            @Valid @RequestBody TerminateGroupRequest request
    ) {
        TerminateGroupResponse response = TerminateGroupResponse.from(
                groupCommandService.terminateGroup(memberId, groupId, request.toCommand())
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}/recurring-schedule")
    public ResponseEntity<ApiResponse<ReplaceRecurringScheduleResponse>> replaceRecurringSchedule(
            @LoginMember Long memberId,
            @PathVariable Long groupId,
            @Valid @RequestBody ReplaceRecurringScheduleRequest request
    ) {
        ReplaceRecurringScheduleResponse response = ReplaceRecurringScheduleResponse.from(
                groupCommandService.replaceRecurringSchedule(memberId, groupId, request.toCommand())
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{groupId}/recurring-schedule")
    public ResponseEntity<Void> removeRecurringSchedule(
            @LoginMember Long memberId,
            @PathVariable Long groupId
    ) {
        groupCommandService.removeRecurringSchedule(memberId, groupId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{groupId}/session-schedule")
    public ResponseEntity<ApiResponse<ReplaceSessionScheduleResponse>> replaceSessionSchedule(
            @LoginMember Long memberId,
            @PathVariable Long groupId,
            @Valid @RequestBody ReplaceSessionScheduleRequest request
    ) {
        ReplaceSessionScheduleResponse response = ReplaceSessionScheduleResponse.from(
                groupCommandService.replaceSessionSchedule(memberId, groupId, request.toCommand())
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
