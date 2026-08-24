package com.project.jarihana.recruitment.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import com.project.jarihana.recruitment.query.repository.RecruitmentDetailRepository;
import com.project.jarihana.recruitment.query.repository.RecruitmentListRepository;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentDetailProjection;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListPage;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListSearchCriteria;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentDetailResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecruitmentQueryServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 10, 0);
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-19T01:00:00Z"),
            ZoneId.of("Asia/Seoul")
    );

    @DisplayName("모집 공고 상세 조회 결과에 승인 인원과 잔여 좌석을 계산한다.")
    @Test
    void findsRecruitmentDetailWithCalculatedSeats() {
        // Given
        Group group = study("서비스테스트스터디");
        GroupRecruitment recruitment = GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                3,
                NOW.minusHours(1),
                NOW.plusDays(1)
        );
        RecruitmentDetailProjection projection = RecruitmentDetailProjection.of(group, recruitment, 2);
        RecruitmentQueryService service = new RecruitmentQueryService(
                new StubRecruitmentDetailRepository(group, projection),
                new UnusedRecruitmentListRepository(),
                CLOCK
        );

        // When
        RecruitmentDetailResult result = service.findRecruitment(12L, 45L);

        // Then
        assertThat(result.group()).isSameAs(group);
        assertThat(result.recruitment()).isSameAs(recruitment);
        assertThat(result.approvedCount()).isEqualTo(2);
        assertThat(result.remainingSeats()).isEqualTo(1);
        assertThat(result.phase()).isEqualTo(RecruitmentPhase.OPEN);
    }

    private static Group study(String name) {
        return Group.createStudy(
                name,
                "함께 학습합니다.",
                null,
                null,
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY),
                        LocalTime.NOON,
                        LocalTime.of(13, 0)
                ),
                NOW
        );
    }

    @DisplayName("존재하지 않는 그룹을 조회하면 그룹 없음 예외를 반환한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given
        RecruitmentQueryService service = new RecruitmentQueryService(
                new StubRecruitmentDetailRepository(null, null),
                new UnusedRecruitmentListRepository(),
                CLOCK
        );

        // When / Then
        assertThatThrownBy(() -> service.findRecruitment(12L, 45L))
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
    }

    @DisplayName("그룹에 속하지 않은 모집 공고를 조회하면 모집 공고 없음 예외를 반환한다.")
    @Test
    void rejectsRecruitmentFromAnotherGroup() {
        // Given
        Group group = study("소속검증스터디");
        RecruitmentQueryService service = new RecruitmentQueryService(
                new StubRecruitmentDetailRepository(group, null),
                new UnusedRecruitmentListRepository(),
                CLOCK
        );

        // When / Then
        assertThatThrownBy(() -> service.findRecruitment(12L, 45L))
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.RECRUITMENT_NOT_FOUND, "모집 공고를 찾을 수 없습니다.");
    }

    private record StubRecruitmentDetailRepository(
            Group group,
            RecruitmentDetailProjection projection
    ) implements RecruitmentDetailRepository {

        @Override
        public Optional<Group> findGroupById(Long groupId) {
            return Optional.ofNullable(group);
        }

        @Override
        public Optional<RecruitmentDetailProjection> findByGroupIdAndRecruitmentId(
                Long groupId,
                Long recruitmentId
        ) {
            return Optional.ofNullable(projection);
        }
    }

    private static final class UnusedRecruitmentListRepository implements RecruitmentListRepository {

        @Override
        public boolean existsGroupById(Long groupId) {
            return false;
        }

        @Override
        public RecruitmentListPage findPage(RecruitmentListSearchCriteria criteria, int size) {
            return new RecruitmentListPage(List.of(), false);
        }
    }
}
