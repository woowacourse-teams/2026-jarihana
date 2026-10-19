package com.project.jarihana.activitypost.command.service;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostCommentCommandRepository;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostComment;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ActivityPostCommentCommandService {

    private final ActivityPostCommandRepository activityPostCommandRepository;
    private final ActivityPostCommentCommandRepository activityPostCommentCommandRepository;
    private final GroupMemberCommandRepository groupMemberCommandRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    @Transactional
    public long create(long memberId, long postId, String content) {
        ActivityPost post = activityPostCommandRepository.findByIdAndDeletedAtIsNull(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, "활동 기록을 찾을 수 없습니다."));
        Member author = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        ActivityPostComment comment = activityPostCommentCommandRepository.save(
                ActivityPostComment.create(post, author, content, LocalDateTime.now(clock))
        );
        return comment.getId();
    }

    @Transactional
    public void delete(long memberId, long commentId) {
        ActivityPostComment comment = activityPostCommentCommandRepository
                .findByIdAndDeletedAtIsNullAndPostDeletedAtIsNull(commentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.ACTIVITY_POST_COMMENT_NOT_FOUND,
                        "댓글을 찾을 수 없습니다."
                ));
        if (!comment.isWrittenBy(memberId) && !isLeaderOfPostGroup(memberId, comment.getPost())) {
            throw new BusinessException(
                    ErrorCode.ACTIVITY_POST_COMMENT_ACCESS_DENIED,
                    "댓글 작성자 또는 모임장만 댓글을 지울 수 있습니다."
            );
        }
        comment.deleteAt(LocalDateTime.now(clock));
    }

    private boolean isLeaderOfPostGroup(long memberId, ActivityPost post) {
        if (post.getGroup() == null) {
            return false;
        }
        return groupMemberCommandRepository.findByGroupIdAndMemberId(post.getGroup().getId(), memberId)
                .map(membership -> membership.getRole() == GroupMemberRole.LEADER)
                .orElse(false);
    }
}
