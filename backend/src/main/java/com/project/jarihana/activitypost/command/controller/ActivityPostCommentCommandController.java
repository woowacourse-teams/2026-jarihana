package com.project.jarihana.activitypost.command.controller;

import com.project.jarihana.activitypost.command.controller.dto.ActivityPostCommentResponse;
import com.project.jarihana.activitypost.command.controller.dto.CreateActivityPostCommentRequest;
import com.project.jarihana.activitypost.command.service.ActivityPostCommentCommandService;
import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ActivityPostCommentCommandController {

    private final ActivityPostCommentCommandService activityPostCommentCommandService;

    @PostMapping("/activity-posts/{postId}/comments")
    public ResponseEntity<ApiResponse<ActivityPostCommentResponse>> createComment(
            @LoginMember long memberId,
            @PathVariable long postId,
            @Valid @RequestBody CreateActivityPostCommentRequest request
    ) {
        long commentId = activityPostCommentCommandService.create(memberId, postId, request.content());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(new ActivityPostCommentResponse(commentId)));
    }

    @DeleteMapping("/activity-post-comments/{commentId}")
    public ResponseEntity<Void> removeComment(
            @LoginMember long memberId,
            @PathVariable long commentId
    ) {
        activityPostCommentCommandService.delete(memberId, commentId);
        return ResponseEntity.noContent().build();
    }
}
