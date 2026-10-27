package com.project.jarihana.proposal.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.LocalDateTime;
import java.util.List;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ProposalTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 27, 12, 0);

    @DisplayName("제목, 내용, 분위기 선택지의 앞뒤 공백을 지우고 만든다.")
    @Test
    void trimsTextWhenCreated() {
        // Given
        Member author = member();

        // When
        Proposal proposal = Proposal.create(
                author,
                ProposalCategory.CULTURE,
                "  느슨한 독서 모임  ",
                "  일주일에 한 번 문장을 나눠요  ",
                List.of("  자유 도서 ", "초보 환영"),
                NOW
        );

        // Then
        assertThat(proposal.getTitle()).isEqualTo("느슨한 독서 모임");
        assertThat(proposal.getContent()).isEqualTo("일주일에 한 번 문장을 나눠요");
        assertThat(proposal.getMoodOptions()).containsExactly("자유 도서", "초보 환영");
        assertThat(proposal.getDeletedAt()).isNull();
    }

    @DisplayName("분위기 선택지 없이도 만들 수 있다.")
    @Test
    void moodOptionsAreOptional() {
        // When
        Proposal proposal = Proposal.create(member(), ProposalCategory.STUDY, "코드 리뷰", "같이 봐요", null, NOW);

        // Then
        assertThat(proposal.getMoodOptions()).isEmpty();
        assertThat(proposal.hasMoodOption(0)).isFalse();
    }

    @DisplayName("제목이나 내용이 비어 있으면 만들 수 없다.")
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\n\t"})
    void blankTitleOrContentCannotBeCreated(String blank) {
        // When & Then
        assertInvalid(() -> Proposal.create(member(), ProposalCategory.SPORT, blank, "내용", List.of(), NOW));
        assertInvalid(() -> Proposal.create(member(), ProposalCategory.SPORT, "제목", blank, List.of(), NOW));
    }

    @DisplayName("제목은 50자, 내용은 1000자를 넘을 수 없다.")
    @Test
    void tooLongTitleOrContentCannotBeCreated() {
        // When & Then
        assertInvalid(() -> Proposal.create(member(), ProposalCategory.ETC, "가".repeat(51), "내용", List.of(), NOW));
        assertInvalid(() -> Proposal.create(member(), ProposalCategory.ETC, "제목", "가".repeat(1001), List.of(), NOW));
    }

    @DisplayName("분야가 없으면 만들 수 없다.")
    @Test
    void categoryIsRequired() {
        // When & Then
        assertInvalid(() -> Proposal.create(member(), null, "제목", "내용", List.of(), NOW));
    }

    @DisplayName("분위기 선택지는 3개까지, 20자 이하, 한 줄이며 서로 달라야 한다.")
    @Test
    void invalidMoodOptionsCannotBeCreated() {
        // When & Then
        assertInvalid(() -> create(List.of("하나", "둘", "셋", "넷")));
        assertInvalid(() -> create(List.of("가".repeat(21))));
        assertInvalid(() -> create(List.of("두 줄\n선택지")));
        assertInvalid(() -> create(List.of("같은 말", " 같은 말 ")));
        assertInvalid(() -> create(List.of("  ")));
    }

    @DisplayName("지우면 같은 ID의 숨긴 제안을 돌려주고, 이미 지운 제안은 그대로 둔다.")
    @Test
    void deleteReturnsHiddenProposal() {
        // Given
        Proposal proposal = create(List.of("자유 도서"));

        // When
        Proposal deleted = proposal.deleteAt(NOW.plusHours(1));

        // Then
        assertThat(proposal.getDeletedAt()).isNull();
        assertThat(deleted.getDeletedAt()).isEqualTo(NOW.plusHours(1));
        assertThat(deleted.getCreatedAt()).isEqualTo(NOW);
        assertThat(deleted.getMoodOptions()).containsExactly("자유 도서");
        assertThat(deleted.deleteAt(NOW.plusHours(2))).isSameAs(deleted);
    }

    private static Proposal create(List<String> moodOptions) {
        return Proposal.create(member(), ProposalCategory.CULTURE, "제목", "내용", moodOptions, NOW);
    }

    private static Member member() {
        return Member.create("모카", 8, "proposal-author", Course.BACKEND);
    }

    private static void assertInvalid(ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }
}
