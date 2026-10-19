package com.project.jarihana.activitypost.query.controller;

import com.project.jarihana.activitypost.query.controller.dto.ActivityPostCommentListRequest;
import com.project.jarihana.activitypost.query.controller.dto.ActivityPostCommentListResponse;
import com.project.jarihana.activitypost.query.service.ActivityPostCommentQueryService;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ActivityPostCommentQueryController {

    private final ActivityPostCommentQueryService activityPostCommentQueryService;
    private final LoginMemberReader loginMemberReader;

    @GetMapping("/activity-posts/{postId}/comments")
    public ResponseEntity<ApiResponse<ActivityPostCommentListResponse>> findComments(
            @PathVariable long postId,
            @Valid @ModelAttribute ActivityPostCommentListRequest request
    ) {
        ActivityPostCommentListResponse response = ActivityPostCommentListResponse.from(
                activityPostCommentQueryService.find(
                        postId,
                        request.toQuery(),
                        loginMemberReader.currentMemberId().orElse(null)
                )
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
