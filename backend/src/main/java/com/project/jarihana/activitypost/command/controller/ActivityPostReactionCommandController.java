package com.project.jarihana.activitypost.command.controller;

import com.project.jarihana.activitypost.command.service.ActivityPostReactionCommandService;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.common.auth.LoginMember;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ActivityPostReactionCommandController {

    private final ActivityPostReactionCommandService activityPostReactionCommandService;

    @PutMapping("/activity-posts/{postId}/reactions/{emoji}")
    public ResponseEntity<Void> addPostReaction(
            @LoginMember long memberId,
            @PathVariable long postId,
            @PathVariable ReactionEmoji emoji
    ) {
        activityPostReactionCommandService.addToPost(memberId, postId, emoji);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/activity-posts/{postId}/reactions/{emoji}")
    public ResponseEntity<Void> removePostReaction(
            @LoginMember long memberId,
            @PathVariable long postId,
            @PathVariable ReactionEmoji emoji
    ) {
        activityPostReactionCommandService.removeFromPost(memberId, postId, emoji);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/activity-post-comments/{commentId}/reactions/{emoji}")
    public ResponseEntity<Void> addCommentReaction(
            @LoginMember long memberId,
            @PathVariable long commentId,
            @PathVariable ReactionEmoji emoji
    ) {
        activityPostReactionCommandService.addToComment(memberId, commentId, emoji);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/activity-post-comments/{commentId}/reactions/{emoji}")
    public ResponseEntity<Void> removeCommentReaction(
            @LoginMember long memberId,
            @PathVariable long commentId,
            @PathVariable ReactionEmoji emoji
    ) {
        activityPostReactionCommandService.removeFromComment(memberId, commentId, emoji);
        return ResponseEntity.noContent().build();
    }
}
