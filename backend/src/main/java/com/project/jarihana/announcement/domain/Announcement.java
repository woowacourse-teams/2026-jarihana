package com.project.jarihana.announcement.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Getter
@Entity
@Table(name = "announcements")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Announcement extends BaseEntity {

    private static final int TITLE_MAX_LENGTH = 100;
    private static final int CONTENT_MAX_LENGTH = 10_000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @Column(nullable = false, length = TITLE_MAX_LENGTH)
    private String title;

    @Column(nullable = false, length = CONTENT_MAX_LENGTH)
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AnnouncementScope scope;

    @Column(name = "request_id")
    private UUID requestId;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private Announcement(Group group, Member author, String title, String content, AnnouncementScope scope,
                         UUID requestId, LocalDateTime createdAt) {
        super(Objects.requireNonNull(createdAt));
        this.group = Objects.requireNonNull(group);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 공지를 등록할 수 없습니다.");
        }
        this.author = Objects.requireNonNull(author);
        this.title = requiredText(title, TITLE_MAX_LENGTH, "제목");
        this.content = requiredText(content, CONTENT_MAX_LENGTH, "본문");
        this.scope = Objects.requireNonNull(scope);
        this.requestId = requestId;
    }

    private Announcement(Long id, Group group, Member author, String title, String content, AnnouncementScope scope,
                         UUID requestId, LocalDateTime createdAt, LocalDateTime deletedAt) {
        super(Objects.requireNonNull(createdAt));
        this.id = id;
        this.group = Objects.requireNonNull(group);
        this.author = Objects.requireNonNull(author);
        this.title = requiredText(title, TITLE_MAX_LENGTH, "제목");
        this.content = requiredText(content, CONTENT_MAX_LENGTH, "본문");
        this.scope = Objects.requireNonNull(scope);
        this.requestId = requestId;
        this.deletedAt = deletedAt;
    }

    public static Announcement create(Group group, Member author, String title, String content,
                                      AnnouncementScope scope, LocalDateTime createdAt) {
        return create(group, author, title, content, scope, null, createdAt);
    }

    public static Announcement create(Group group, Member author, String title, String content,
                                      AnnouncementScope scope, UUID requestId, LocalDateTime createdAt) {
        return new Announcement(group, author, title, content, scope, requestId, createdAt);
    }

    public boolean hasSameContent(Announcement other) {
        return title.equals(other.title) && content.equals(other.content) && scope == other.scope;
    }

    public Announcement modify(String title, String content, AnnouncementScope scope) {
        if (deletedAt != null) {
            throw new BusinessException(ErrorCode.ANNOUNCEMENT_NOT_FOUND, "공지를 찾을 수 없습니다.");
        }
        return new Announcement(id, group, author, title, content, scope, requestId, getCreatedAt(), null);
    }

    public Announcement deleteAt(LocalDateTime now) {
        if (deletedAt != null) {
            throw new BusinessException(ErrorCode.ANNOUNCEMENT_NOT_FOUND, "공지를 찾을 수 없습니다.");
        }
        return new Announcement(id, group, author, title, content, scope, requestId, getCreatedAt(), Objects.requireNonNull(now));
    }

    private static String requiredText(String value, int maxLength, String field) {
        if (value == null || value.isBlank() || value.trim().length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공지 " + field + "은 1자부터 "
                    + maxLength + "자까지 입력할 수 있습니다.");
        }
        return value.trim();
    }
}
