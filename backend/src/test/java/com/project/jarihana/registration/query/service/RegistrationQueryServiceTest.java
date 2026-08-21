package com.project.jarihana.registration.query.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.registration.domain.DecisionActorType;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.registration.query.repository.RegistrationListRepository;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListSearchCriteria;
import com.project.jarihana.registration.query.repository.dto.RegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.RegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.RegistrationListSearchCriteria;
import com.project.jarihana.registration.query.service.dto.MyRegistrationListResult;
import com.project.jarihana.registration.query.service.dto.RegistrationListQuery;
import com.project.jarihana.registration.query.service.dto.RegistrationListResult;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RegistrationQueryServiceTest {

    private static final Long MEMBER_ID = 21L;
    private static final Long RECRUITMENT_ID = 45L;
    private static final LocalDateTime REGISTERED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    private final FakeRegistrationListRepository repository = new FakeRegistrationListRepository();
    private final RegistrationQueryService service = new RegistrationQueryService(repository);

    @DisplayName("내 신청 목록을 조회하고 다음 커서를 생성한다.")
    @Test
    void findsMyRegistrationsAndCreatesNextCursor() {
        // Given
        repository.givenMyPage(new MyRegistrationListPage(
                List.of(new MyRegistrationListProjection(
                        88L,
                        12L,
                        "알고리즘 스터디",
                        RECRUITMENT_ID,
                        "함께 활동하고 싶습니다.",
                        RegistrationStatus.PENDING,
                        REGISTERED_AT,
                        null,
                        null,
                        null,
                        null
                )),
                true
        ));

        // When
        MyRegistrationListResult result = service.findMyRegistrations(
                MEMBER_ID,
                new RegistrationListQuery(null, null, 20)
        );

        // Then
        assertThat(result.items()).containsExactly(new MyRegistrationListResult.Item(
                88L,
                12L,
                "알고리즘 스터디",
                RECRUITMENT_ID,
                "함께 활동하고 싶습니다.",
                "PENDING",
                REGISTERED_AT,
                null,
                null,
                null,
                null
        ));
        assertThat(decodeCursor(result.nextCursor())).isEqualTo("2026-08-19T10:00|88");
        assertThat(result.hasNext()).isTrue();
        assertThat(repository.lastMyCriteria()).isEqualTo(
                new MyRegistrationListSearchCriteria(MEMBER_ID, null, null, null)
        );
        assertThat(repository.lastMySize()).isEqualTo(20);
    }

    @DisplayName("리더용 신청자 목록을 조회하고 결과를 변환한다.")
    @Test
    void findsRegistrationsForLeader() {
        // Given
        repository.givenLeaderAccess(true);
        repository.givenPage(new RegistrationListPage(List.of(new RegistrationListProjection(
                88L,
                21L,
                "마루",
                8,
                Course.FRONTEND,
                "신청 메시지",
                RegistrationStatus.APPROVED,
                REGISTERED_AT,
                null,
                REGISTERED_AT.plusMinutes(10),
                DecisionActorType.MEMBER,
                MEMBER_ID
        )), false));

        // When
        RegistrationListResult result = service.findRegistrations(
                MEMBER_ID,
                RECRUITMENT_ID,
                new RegistrationListQuery(null, null, 20)
        );

        // Then
        assertThat(result.items()).containsExactly(new RegistrationListResult.Item(
                88L,
                21L,
                "마루",
                8,
                "FRONTEND",
                "신청 메시지",
                "APPROVED",
                REGISTERED_AT,
                null,
                REGISTERED_AT.plusMinutes(10),
                "MEMBER",
                MEMBER_ID
        ));
        assertThat(result.nextCursor()).isNull();
        assertThat(result.hasNext()).isFalse();
    }

    @DisplayName("내 신청 목록의 커서를 해석해 저장소에 전달한다.")
    @Test
    void passesDecodedMyCursorToRepository() {
        // Given
        repository.givenMyPage(new MyRegistrationListPage(List.of(), false));
        String cursor = encodeCursor("2026-08-19T11:00|102");

        // When
        service.findMyRegistrations(
                MEMBER_ID,
                new RegistrationListQuery(RegistrationStatus.APPROVED, cursor, 10)
        );

        // Then
        assertThat(repository.lastMyCriteria()).isEqualTo(new MyRegistrationListSearchCriteria(
                MEMBER_ID,
                RegistrationStatus.APPROVED,
                REGISTERED_AT.plusHours(1),
                102L
        ));
        assertThat(repository.lastMySize()).isEqualTo(10);
    }

    @DisplayName("내 신청 목록의 페이지 크기가 범위를 벗어나면 거부한다.")
    @ValueSource(ints = {0, 101})
    @ParameterizedTest
    void rejectsInvalidMyPageSize(int size) {
        // Given
        RegistrationListQuery query = new RegistrationListQuery(null, null, size);

        // When / Then
        assertInvalidParameter(() -> service.findMyRegistrations(MEMBER_ID, query));
    }

    @DisplayName("내 신청 목록의 커서 형식이 잘못되면 거부한다.")
    @Test
    void rejectsInvalidMyCursor() {
        // Given
        RegistrationListQuery query = new RegistrationListQuery(null, "invalid-cursor", 20);

        // When / Then
        assertInvalidParameter(() -> service.findMyRegistrations(MEMBER_ID, query));
    }

    private static String encodeCursor(String value) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String decodeCursor(String cursor) {
        return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
    }

    private static void assertInvalidParameter(Runnable invocation) {
        assertThatThrownBy(invocation::run)
                .isInstanceOf(BusinessException.class)
                .extracting(
                        exception -> ((BusinessException) exception).getErrorCode(),
                        Throwable::getMessage
                )
                .containsExactly(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    private static final class FakeRegistrationListRepository implements RegistrationListRepository {

        private Optional<Long> groupId = Optional.of(12L);
        private boolean leaderAccess;
        private RegistrationListPage page = new RegistrationListPage(List.of(), false);
        private MyRegistrationListPage myPage = new MyRegistrationListPage(List.of(), false);
        private MyRegistrationListSearchCriteria lastMyCriteria;
        private int lastMySize;

        @Override
        public Optional<Long> findGroupIdByRecruitmentId(Long recruitmentId) {
            return groupId;
        }

        @Override
        public boolean existsLeaderByGroupIdAndMemberId(Long groupId, Long memberId) {
            return leaderAccess;
        }

        @Override
        public RegistrationListPage findPage(RegistrationListSearchCriteria criteria, int size) {
            return page;
        }

        @Override
        public MyRegistrationListPage findMyPage(MyRegistrationListSearchCriteria criteria, int size) {
            lastMyCriteria = criteria;
            lastMySize = size;
            return myPage;
        }

        void givenLeaderAccess(boolean leaderAccess) {
            this.leaderAccess = leaderAccess;
        }

        void givenPage(RegistrationListPage page) {
            this.page = page;
        }

        void givenMyPage(MyRegistrationListPage myPage) {
            this.myPage = myPage;
        }

        MyRegistrationListSearchCriteria lastMyCriteria() {
            return lastMyCriteria;
        }

        int lastMySize() {
            return lastMySize;
        }
    }
}
