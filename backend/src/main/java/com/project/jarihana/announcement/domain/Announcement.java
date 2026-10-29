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

    private Announcement(Group group, Member author, String title, String content, AnnouncementScope scope,
                         LocalDateTime createdAt) {
        super(Objects.requireNonNull(createdAt));
        this.group = Objects.requireNonNull(group);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 공지를 등록할 수 없습니다.");
        }
        this.author = Objects.requireNonNull(author);
        this.title = requiredText(title, TITLE_MAX_LENGTH, "제목");
        this.content = requiredText(content, CONTENT_MAX_LENGTH, "본문");
        this.scope = Objects.requireNonNull(scope);
    }

    public static Announcement create(Group group, Member author, String title, String content,
                                      AnnouncementScope scope, LocalDateTime createdAt) {
        return new Announcement(group, author, title, content, scope, createdAt);
    }

    private static String requiredText(String value, int maxLength, String field) {
        if (value == null || value.isBlank() || value.trim().length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공지 " + field + "은 1자부터 "
                    + maxLength + "자까지 입력할 수 있습니다.");
        }
        return value.trim();
    }
}
