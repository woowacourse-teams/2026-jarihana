package com.project.jarihana.activitypost.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Index;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "activity_post",
        indexes = {
                @Index(name = "idx_activity_post_date_id", columnList = "activity_date DESC, id DESC"),
                @Index(name = "idx_activity_post_group_date_id", columnList = "group_id, activity_date DESC, id DESC"),
                @Index(name = "idx_activity_post_author_date_id", columnList = "author_member_id, activity_date DESC, id DESC")
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityPost extends BaseEntity {

    public static final int MAX_CAPTION_LENGTH = 50;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private Group group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @Column(name = "caption", length = MAX_CAPTION_LENGTH)
    private String caption;

    @Column(name = "activity_date", nullable = false)
    private LocalDate activityDate;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private ActivityPost(
            Group group,
            Member author,
            String caption,
            LocalDate activityDate,
            LocalDateTime createdAt
    ) {
        super(require(createdAt));
        this.group = require(group, "그룹");
        this.author = require(author, "작성자");
        this.caption = normalizeCaption(caption);
        this.activityDate = require(activityDate, "활동 날짜");
    }

    public static ActivityPost create(
            Group group,
            Member author,
            String caption,
            LocalDate activityDate,
            LocalDateTime createdAt
    ) {
        return new ActivityPost(group, author, caption, activityDate, createdAt);
    }

    public void modify(String caption, LocalDate activityDate) {
        this.caption = normalizeCaption(caption);
        this.activityDate = require(activityDate, "활동 날짜");
    }

    public void deleteAt(LocalDateTime now) {
        if (deletedAt == null) {
            deletedAt = require(now);
        }
    }

    public void hideAfterGroupDeletion(LocalDateTime now) {
        deleteAt(now);
        group = null;
    }

    private static String normalizeCaption(String caption) {
        if (caption == null || caption.isBlank()) {
            return null;
        }
        String normalized = caption.trim();
        if (normalized.length() > MAX_CAPTION_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "한 줄 소개는 50자 이하여야 합니다.");
        }
        return normalized;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    private static LocalDateTime require(LocalDateTime value) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "생성 시각은 필수입니다.");
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public Group getGroup() {
        return group;
    }

    public Member getAuthor() {
        return author;
    }

    public String getCaption() {
        return caption;
    }

    public LocalDate getActivityDate() {
        return activityDate;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }
}
