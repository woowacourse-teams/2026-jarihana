package com.project.jarihana.proposal.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ProposalInterestTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 27, 12, 0);

    @DisplayName("조건 없이 마음만 보낼 수 있다.")
    @Test
    void conditionsAreOptional() {
        // When
        ProposalInterest interest = ProposalInterest.create(proposal(), member(), null, null, null, NOW);

        // Then
        assertThat(interest.getTimeSlots()).isEmpty();
        assertThat(interest.getMeetingModes()).isEmpty();
        assertThat(interest.getMoodIndexes()).isEmpty();
    }

    @DisplayName("조건을 바꾸면 같은 응답 시각을 유지한 새 응답을 돌려준다.")
    @Test
    void changeConditionsReturnsNewInterest() {
        // Given
        ProposalInterest interest = ProposalInterest.create(proposal(), member(), Set.of(), Set.of(), Set.of(), NOW);

        // When
        ProposalInterest changed = interest.changeConditions(
                Set.of(ProposalTimeSlot.WEEKDAY_EVENING),
                Set.of(ProposalMeetingMode.ONLINE, ProposalMeetingMode.OFFLINE),
                Set.of(1)
        );

        // Then
        assertThat(interest.getTimeSlots()).isEmpty();
        assertThat(changed.getTimeSlots()).containsExactly(ProposalTimeSlot.WEEKDAY_EVENING);
        assertThat(changed.getMeetingModes())
                .containsExactly(ProposalMeetingMode.ONLINE, ProposalMeetingMode.OFFLINE);
        assertThat(changed.getMoodIndexes()).containsExactly(1);
        assertThat(changed.getCreatedAt()).isEqualTo(NOW);
    }

    @DisplayName("제안에 없는 분위기 선택지는 고를 수 없다.")
    @Test
    void unknownMoodIndexCannotBeSelected() {
        // When & Then
        assertInvalid(Set.of(2));
        assertInvalid(Set.of(-1));
        Set<Integer> withNull = new HashSet<>();
        withNull.add(null);
        assertInvalid(withNull);
    }

    @DisplayName("비어 있는 시간이나 방식 값은 거부한다.")
    @Test
    void nullConditionValueIsRejected() {
        // Given
        Set<ProposalTimeSlot> timeSlots = new HashSet<>();
        timeSlots.add(null);
        Set<ProposalMeetingMode> meetingModes = new HashSet<>();
        meetingModes.add(null);

        // When & Then
        assertThatThrownBy(() -> ProposalInterest.create(proposal(), member(), timeSlots, Set.of(), Set.of(), NOW))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> ProposalInterest.create(proposal(), member(), Set.of(), meetingModes, Set.of(), NOW))
                .isInstanceOf(BusinessException.class);
    }

    private static void assertInvalid(Set<Integer> moodIndexes) {
        assertThatThrownBy(() -> ProposalInterest.create(proposal(), member(), Set.of(), Set.of(), moodIndexes, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    private static Proposal proposal() {
        return Proposal.create(
                Member.create("모카", 8, "interest-author", Course.BACKEND),
                ProposalCategory.CULTURE,
                "독서 모임",
                "같이 읽어요",
                List.of("자유 도서", "지정 도서"),
                NOW
        );
    }

    private static Member member() {
        return Member.create("하루", 8, "interest-member", Course.FRONTEND);
    }
}
