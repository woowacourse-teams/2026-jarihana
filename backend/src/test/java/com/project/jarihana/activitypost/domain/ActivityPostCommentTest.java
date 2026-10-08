package com.project.jarihana.activitypost.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ActivityPostCommentTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 8, 12, 0);

    @DisplayName("댓글 내용의 앞뒤 공백을 지우고 저장한다.")
    @Test
    void trimsContent() {
        // Given
        ActivityPost post = post();
        Member author = member();

        // When
        ActivityPostComment comment = ActivityPostComment.create(post, author, "  반가워요  ", NOW);

        // Then
        assertThat(comment.getContent()).isEqualTo("반가워요");
        assertThat(comment.getDeletedAt()).isNull();
    }

    @DisplayName("비어 있는 댓글은 만들 수 없다.")
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\n\t"})
    void blankContentCannotBeCreated(String content) {
        // Given
        ActivityPost post = post();
        Member author = member();

        // When & Then
        assertThatThrownBy(() -> ActivityPostComment.create(post, author, content, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("200자를 넘는 댓글은 만들 수 없다.")
    @Test
    void tooLongContentCannotBeCreated() {
        // Given
        ActivityPost post = post();
        Member author = member();

        // When & Then
        assertThat(ActivityPostComment.create(post, author, "가".repeat(200), NOW).getContent()).hasSize(200);
        assertThatThrownBy(() -> ActivityPostComment.create(post, author, "가".repeat(201), NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("한 번 지운 댓글은 처음 지운 시각을 유지한다.")
    @Test
    void keepsFirstDeletionTime() {
        // Given
        ActivityPostComment comment = ActivityPostComment.create(post(), member(), "지울 댓글", NOW);

        // When
        comment.deleteAt(NOW.plusMinutes(1));
        comment.deleteAt(NOW.plusMinutes(5));

        // Then
        assertThat(comment.getDeletedAt()).isEqualTo(NOW.plusMinutes(1));
    }

    private static ActivityPost post() {
        Group group = Group.createStudy(
                "댓글 도메인 그룹",
                "함께 활동을 기록해요",
                null,
                null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                NOW
        );
        return ActivityPost.create(group, member(), "함께한 하루", LocalDate.of(2026, 10, 1), NOW);
    }

    private static Member member() {
        return Member.create("가온", 20, "comment-domain-member", Course.BACKEND);
    }
}
