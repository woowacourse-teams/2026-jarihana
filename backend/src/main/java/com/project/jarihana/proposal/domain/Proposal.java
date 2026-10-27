package com.project.jarihana.proposal.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 자유게시판의 모임 제안이다. 모임 신청이 아니라 함께할 사람이 있는지 알아보는 글이며,
 * 제안자가 정한 분위기 선택지는 응답이 순번으로 가리키므로 작성 뒤에 바꾸지 않는다.
 */
@Entity
@Table(name = "proposal")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Proposal extends BaseEntity {

    public static final int MAX_TITLE_LENGTH = 50;
    public static final int MAX_CONTENT_LENGTH = 1000;
    public static final int MAX_MOOD_OPTION_COUNT = 3;
    public static final int MAX_MOOD_OPTION_LENGTH = 20;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    private ProposalCategory category;

    @Column(name = "title", nullable = false, length = MAX_TITLE_LENGTH)
    private String title;

    @Column(name = "content", nullable = false, length = MAX_CONTENT_LENGTH)
    private String content;

    @Convert(converter = ProposalMoodOptionsConverter.class)
    @Column(name = "mood_options", nullable = false, length = 100)
    private List<String> moodOptions;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private Proposal(
            Long id,
            Member author,
            ProposalCategory category,
            String title,
            String content,
            List<String> moodOptions,
            LocalDateTime createdAt,
            LocalDateTime deletedAt
    ) {
        super(require(createdAt, "작성 시각은 필수입니다."));
        this.id = id;
        this.author = require(author, "작성자는 필수입니다.");
        this.category = require(category, "분야를 골라 주세요.");
        this.title = validateTitle(title);
        this.content = validateContent(content);
        this.moodOptions = validateMoodOptions(moodOptions);
        this.deletedAt = deletedAt;
    }

    public static Proposal create(
            Member author,
            ProposalCategory category,
            String title,
            String content,
            List<String> moodOptions,
            LocalDateTime createdAt
    ) {
        return new Proposal(null, author, category, title, content, moodOptions, createdAt, null);
    }

    public Proposal deleteAt(LocalDateTime now) {
        if (deletedAt != null) {
            return this;
        }
        return new Proposal(
                id,
                author,
                category,
                title,
                content,
                moodOptions,
                getCreatedAt(),
                require(now, "삭제 시각은 필수입니다.")
        );
    }

    public boolean isWrittenBy(long memberId) {
        return author.getId() != null && author.getId() == memberId;
    }

    public boolean hasMoodOption(int index) {
        return index >= 0 && index < moodOptions.size();
    }

    private static String validateTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "제목을 입력해 주세요.");
        }
        String normalized = title.trim();
        if (normalized.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "제목은 50자 이하여야 합니다.");
        }
        return normalized;
    }

    private static String validateContent(String content) {
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "내용을 입력해 주세요.");
        }
        String normalized = content.trim();
        if (normalized.length() > MAX_CONTENT_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "내용은 1000자 이하여야 합니다.");
        }
        return normalized;
    }

    private static List<String> validateMoodOptions(List<String> moodOptions) {
        if (moodOptions == null || moodOptions.isEmpty()) {
            return List.of();
        }
        if (moodOptions.size() > MAX_MOOD_OPTION_COUNT) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분위기 선택지는 3개까지 정할 수 있습니다.");
        }
        List<String> normalized = moodOptions.stream().map(Proposal::validateMoodOption).toList();
        if (new HashSet<>(normalized).size() != normalized.size()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분위기 선택지가 서로 겹치지 않아야 합니다.");
        }
        return normalized;
    }

    private static String validateMoodOption(String option) {
        if (option == null || option.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분위기 선택지를 입력해 주세요.");
        }
        String normalized = option.trim();
        if (normalized.length() > MAX_MOOD_OPTION_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분위기 선택지는 20자 이하여야 합니다.");
        }
        if (normalized.contains("\n") || normalized.contains("\r")) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "분위기 선택지는 한 줄로 입력해 주세요.");
        }
        return normalized;
    }

    private static <T> T require(T value, String message) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, message);
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public Member getAuthor() {
        return author;
    }

    public ProposalCategory getCategory() {
        return category;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public List<String> getMoodOptions() {
        return moodOptions;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }
}
