package com.project.jarihana.activitypost.command.controller;

import com.project.jarihana.activitypost.command.controller.dto.ActivityPostResponse;
import com.project.jarihana.activitypost.command.controller.dto.CreateActivityPostRequest;
import com.project.jarihana.activitypost.command.controller.dto.ModifyActivityPostRequest;
import com.project.jarihana.activitypost.command.service.ActivityPostCommandService;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ActivityPostCommandController {

    private final ActivityPostCommandService activityPostCommandService;

    public ActivityPostCommandController(ActivityPostCommandService activityPostCommandService) {
        this.activityPostCommandService = activityPostCommandService;
    }

    @PostMapping("/groups/{groupId}/activity-posts")
    public ResponseEntity<ApiResponse<ActivityPostResponse>> create(
            @LoginMember Long memberId,
            @PathVariable long groupId,
            @Valid @RequestBody CreateActivityPostRequest request
    ) {
        ActivityPostResponse response = ActivityPostResponse.from(
                activityPostCommandService.create(memberId, groupId, request.toCommand())
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @PutMapping("/activity-posts/{postId}")
    public ResponseEntity<ApiResponse<Void>> modify(
            @LoginMember Long memberId,
            @PathVariable long postId,
            @Valid @RequestBody ModifyActivityPostRequest request
    ) {
        activityPostCommandService.modify(memberId, postId, request.toCommand());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @DeleteMapping("/activity-posts/{postId}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @LoginMember Long memberId,
            @PathVariable long postId
    ) {
        activityPostCommandService.delete(memberId, postId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
