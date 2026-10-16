package com.project.jarihana.activitypost.query.controller;

import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.activitypost.query.controller.dto.ActivityReactorListResponse;
import com.project.jarihana.activitypost.query.service.ActivityPostReactorQueryService;
import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ActivityPostReactionQueryController {

    private final ActivityPostReactorQueryService activityPostReactorQueryService;
    private final LoginMemberReader loginMemberReader;

    @GetMapping("/activity-posts/{postId}/reactions/{emoji}")
    public ResponseEntity<ApiResponse<ActivityReactorListResponse>> findPostReactors(
            @PathVariable long postId,
            @PathVariable ReactionEmoji emoji
    ) {
        ActivityReactorListResponse response = ActivityReactorListResponse.from(
                activityPostReactorQueryService.findForPost(
                        postId,
                        emoji,
                        loginMemberReader.currentMemberId().orElse(null)
                )
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/activity-post-comments/{commentId}/reactions/{emoji}")
    public ResponseEntity<ApiResponse<ActivityReactorListResponse>> findCommentReactors(
            @PathVariable long commentId,
            @PathVariable ReactionEmoji emoji
    ) {
        ActivityReactorListResponse response = ActivityReactorListResponse.from(
                activityPostReactorQueryService.findForComment(
                        commentId,
                        emoji,
                        loginMemberReader.currentMemberId().orElse(null)
                )
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
