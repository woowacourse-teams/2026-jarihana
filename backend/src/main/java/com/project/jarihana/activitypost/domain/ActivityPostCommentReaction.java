package com.project.jarihana.activitypost.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "activity_post_comment_reaction",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_activity_post_comment_reaction_comment_member_emoji",
                columnNames = {"activity_post_comment_id", "member_id", "emoji"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityPostCommentReaction extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_post_comment_id", nullable = false)
    private ActivityPostComment comment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "emoji", nullable = false, length = 20)
    private ReactionEmoji emoji;

    private ActivityPostCommentReaction(
            ActivityPostComment comment,
            Member member,
            ReactionEmoji emoji,
            LocalDateTime createdAt
    ) {
        super(require(createdAt, "반응 시각"));
        this.comment = require(comment, "댓글");
        this.member = require(member, "회원");
        this.emoji = require(emoji, "이모지");
    }

    public static ActivityPostCommentReaction create(
            ActivityPostComment comment,
            Member member,
            ReactionEmoji emoji,
            LocalDateTime createdAt
    ) {
        return new ActivityPostCommentReaction(comment, member, emoji, createdAt);
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public ActivityPostComment getComment() {
        return comment;
    }

    public Member getMember() {
        return member;
    }

    public ReactionEmoji getEmoji() {
        return emoji;
    }
}
