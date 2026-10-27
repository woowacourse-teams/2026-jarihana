package com.project.jarihana.proposal.domain;

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
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 모임 제안에 남긴 코멘트다. 로그인 회원 누구나 남기고, 지우면 숨김 시각만 기록한다.
 */
@Entity
@Table(name = "proposal_comment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProposalComment extends BaseEntity {

    public static final int MAX_CONTENT_LENGTH = 300;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposal_id", nullable = false)
    private Proposal proposal;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @Column(name = "content", nullable = false, length = MAX_CONTENT_LENGTH)
    private String content;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private ProposalComment(
            Long id,
            Proposal proposal,
            Member author,
            String content,
            LocalDateTime createdAt,
            LocalDateTime deletedAt
    ) {
        super(require(createdAt, "작성 시각은 필수입니다."));
        this.id = id;
        this.proposal = require(proposal, "모임 제안은 필수입니다.");
        this.author = require(author, "작성자는 필수입니다.");
        this.content = validateContent(content);
        this.deletedAt = deletedAt;
    }

    public static ProposalComment create(Proposal proposal, Member author, String content, LocalDateTime createdAt) {
        return new ProposalComment(null, proposal, author, content, createdAt, null);
    }

    public ProposalComment deleteAt(LocalDateTime now) {
        if (deletedAt != null) {
            return this;
        }
        return new ProposalComment(id, proposal, author, content, getCreatedAt(), require(now, "삭제 시각은 필수입니다."));
    }

    public boolean isWrittenBy(long memberId) {
        return author.getId() != null && author.getId() == memberId;
    }

    private static String validateContent(String content) {
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "코멘트 내용을 입력해 주세요.");
        }
        String normalized = content.trim();
        if (normalized.length() > MAX_CONTENT_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "코멘트는 300자 이하여야 합니다.");
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

    public Proposal getProposal() {
        return proposal;
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
