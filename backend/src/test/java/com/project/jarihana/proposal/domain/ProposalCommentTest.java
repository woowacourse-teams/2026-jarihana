package com.project.jarihana.proposal.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ProposalCommentTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 27, 12, 0);

    @DisplayName("코멘트 내용의 앞뒤 공백을 지우고 저장한다.")
    @Test
    void trimsContent() {
        // When
        ProposalComment comment = ProposalComment.create(proposal(), member(), "  평일 저녁이면 좋아요  ", NOW);

        // Then
        assertThat(comment.getContent()).isEqualTo("평일 저녁이면 좋아요");
    }

    @DisplayName("비어 있는 코멘트는 만들 수 없다.")
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\n\t"})
    void blankContentCannotBeCreated(String content) {
        // When & Then
        assertThatThrownBy(() -> ProposalComment.create(proposal(), member(), content, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("300자를 넘는 코멘트는 만들 수 없다.")
    @Test
    void tooLongContentCannotBeCreated() {
        // When & Then
        assertThatThrownBy(() -> ProposalComment.create(proposal(), member(), "가".repeat(301), NOW))
                .isInstanceOf(BusinessException.class);
    }

    @DisplayName("지우면 숨김 시각을 기록한 새 코멘트를 돌려준다.")
    @Test
    void deleteReturnsHiddenComment() {
        // Given
        ProposalComment comment = ProposalComment.create(proposal(), member(), "반가워요", NOW);

        // When
        ProposalComment deleted = comment.deleteAt(NOW.plusMinutes(5));

        // Then
        assertThat(comment.getDeletedAt()).isNull();
        assertThat(deleted.getDeletedAt()).isEqualTo(NOW.plusMinutes(5));
        assertThat(deleted.getContent()).isEqualTo("반가워요");
    }

    private static Proposal proposal() {
        return Proposal.create(
                Member.create("모카", 8, "comment-proposal-author", Course.BACKEND),
                ProposalCategory.CULTURE,
                "독서 모임",
                "같이 읽어요",
                List.of(),
                NOW
        );
    }

    private static Member member() {
        return Member.create("하루", 8, "comment-member", Course.FRONTEND);
    }
}
