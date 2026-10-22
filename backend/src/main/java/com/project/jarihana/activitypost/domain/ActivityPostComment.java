package com.project.jarihana.activitypost.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "activity_post_comment",
        indexes = @Index(name = "idx_activity_post_comment_post_created_id", columnList = "activity_post_id, created_at, id")
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityPostComment extends BaseEntity {

    public static final int MAX_CONTENT_LENGTH = 200;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_post_id", nullable = false)
    private ActivityPost post;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @Column(name = "content", nullable = false, length = MAX_CONTENT_LENGTH)
    private String content;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private ActivityPostComment(ActivityPost post, Member author, String content, LocalDateTime createdAt) {
        super(require(createdAt, "작성 시각"));
        this.post = require(post, "활동 기록");
        this.author = require(author, "작성자");
        this.content = validateContent(content);
    }

    public static ActivityPostComment create(
            ActivityPost post,
            Member author,
            String content,
            LocalDateTime createdAt
    ) {
        return new ActivityPostComment(post, author, content, createdAt);
    }

    public void deleteAt(LocalDateTime now) {
        if (deletedAt == null) {
            deletedAt = require(now, "삭제 시각");
        }
    }

    public boolean isWrittenBy(long memberId) {
        return author.getId() != null && author.getId() == memberId;
    }

    private static String validateContent(String content) {
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "댓글 내용을 입력해 주세요.");
        }
        String normalized = content.trim();
        if (normalized.length() > MAX_CONTENT_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "댓글은 200자 이하여야 합니다.");
        }
        return normalized;
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

    public ActivityPost getPost() {
        return post;
    }

    public Member getAuthor() {
        return author;
    }

    public String getContent() {
        return content;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }
}
