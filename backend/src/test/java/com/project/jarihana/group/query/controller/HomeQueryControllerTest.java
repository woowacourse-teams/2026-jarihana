package com.project.jarihana.group.query.controller;

import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.group.query.service.GroupQueryService;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.group.query.service.dto.HomeQuery;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.DecisionActor;
import io.restassured.RestAssured;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

class HomeQueryControllerTest extends IntegrationTestSupport {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;
    private static final LocalDate DATE = LocalDate.of(2026, 10, 20);

    @Autowired
    private GroupJpaRepository groupRepository;
    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;
    @Autowired
    private RegistrationJpaRepository registrationRepository;
    @Autowired
    private GroupQueryService groupQueryService;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @DisplayName("비회원도 홈의 빈 세 목록을 조회한다.")
    @Test
    void returnsEmptySectionsWithoutAuthentication() {
        // Given
        // When / Then
        RestAssured.given().when().get("/home")
                .then().statusCode(200)
                .body("success", equalTo(true))
                .body("data.today.items", empty())
                .body("data.recruiting.items", empty())
                .body("data.ended.items", empty())
                .body("data.today.hasNext", equalTo(false))
                .body("data.recruiting.hasNext", equalTo(false))
                .body("data.ended.hasNext", equalTo(false))
                .body("data.today.nextCursor", nullValue())
                .body("data.recruiting.nextCursor", nullValue())
                .body("data.ended.nextCursor", nullValue())
                .body("error", nullValue());
    }

    @DisplayName("홈의 세 목록은 기존 API와 필드, 정렬, 페이지 크기, 다음 커서가 같다.")
    @Test
    void matchesExistingListsAndContinuesTheirCursors() {
        // Given
        Member leader = memberRepository.save(Member.create("가온", 8, "home-leader", Course.BACKEND));
        Member invited = memberRepository.save(Member.create("나루", 8, "home-invited", Course.BACKEND));
        for (int index = 0; index < 101; index++) {
            Group group = saveSession("오늘모임" + index, DATE);
            if (index >= 96) {
                groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
                groupMemberRepository.save(GroupMember.createMember(group, invited, NOW));
                GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(
                        group, JoinMethod.APPROVAL, 10, NOW.minusDays(1), null));
                registrationRepository.save(Registration.createPending(recruitment, leader, null, NOW)
                        .approve(DecisionActor.member(leader.getId()), NOW, 0));
                registrationRepository.save(Registration.createPending(recruitment, invited, null, NOW).approveByInvitation(NOW));
            }
        }
        for (int index = 0; index < 5; index++) {
            groupRepository.save(Group.createStudy("종료모임" + index, "종료된 모임", null, null, null,
                    NOW.minusDays(2)).endAt(NOW));
        }
        saveSession("다른날짜모임", DATE.plusDays(1));
        Group closed = groupRepository.save(Group.createStudy("마감모임", "마감된 모집", null, null, null, NOW));
        recruitmentRepository.save(GroupRecruitment.create(closed, JoinMethod.AUTO, 10, NOW.minusDays(1), NOW));
        Group upcoming = groupRepository.save(Group.createStudy("예정모임", "예정된 모집", null, null, null, NOW));
        recruitmentRepository.save(GroupRecruitment.create(upcoming, JoinMethod.AUTO, 10, NOW.plusDays(1), null));
        Group full = groupRepository.save(Group.createStudy("정원모임", "정원이 찬 모집", null, null, null, NOW));
        GroupRecruitment fullRecruitment = recruitmentRepository.save(GroupRecruitment.create(full, JoinMethod.AUTO, 1, NOW.minusDays(1), null));
        registrationRepository.save(Registration.createAutoApproved(fullRecruitment, leader, null, NOW, 0));

        // When
        var home = RestAssured.given().queryParam("sessionDate", DATE.toString()).when().get("/home")
                .then().statusCode(200).extract().jsonPath();

        // Then
        assertSection(home.getMap("data.today"), Map.of("type", "SESSION", "status", "ACTIVE", "sessionDate", DATE.toString(), "size", 100));
        assertSection(home.getMap("data.recruiting"), Map.of("status", "ACTIVE", "recruiting", true, "size", 4));
        assertSection(home.getMap("data.ended"), Map.of("status", "ENDED", "size", 4));
        assertThat(home.getList("data.today.items")).hasSize(100);
        assertThat(home.getList("data.recruiting.items")).hasSize(4);
        assertThat(home.getList("data.ended.items")).hasSize(4);
        assertThat(home.getInt("data.today.items[0].memberCount")).isEqualTo(2);
        assertThat(home.getInt("data.today.items[0].activeRecruitment.approvedCount")).isEqualTo(1);
        assertThat(home.getString("data.today.items[0].leader.crewName")).isEqualTo("가온");
    }

    @DisplayName("날짜 생략 시 주입한 서울 Clock의 오늘 세션만 반환한다.")
    @Test
    void defaultsToClockDate() {
        // Given
        Group today = saveSession("오늘세션", NOW.toLocalDate());
        saveSession("내일세션", NOW.toLocalDate().plusDays(1));

        // When / Then
        RestAssured.get("/home").then().statusCode(200)
                .body("data.today.items.id", equalTo(List.of(today.getId().intValue())));
    }

    @DisplayName("잘못된 홈 날짜는 공통 파라미터 오류로 응답한다.")
    @Test
    void rejectsInvalidDate() {
        // Given
        // When / Then
        RestAssured.given().queryParam("sessionDate", "not-a-date").get("/home")
                .then().statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @DisplayName("홈은 기본 목록을 각각 조회하고 연관 조회를 공유해 기존 11개 SQL을 6개로 줄인다.")
    @Test
    void batchesHomeReferencesWithSixStatements() {
        // Given
        Group today = saveSession("겹치는세션", DATE);
        Group study = groupRepository.save(Group.createStudy("모집스터디", "모집하는 모임", null, null, null, NOW.minusDays(2)));
        groupRepository.save(Group.createStudy("종료스터디", "종료된 모임", null, null, null, NOW.minusDays(2)).endAt(NOW));
        Member leader = memberRepository.save(Member.create("가온", 8, "batch-leader", Course.BACKEND));
        for (Group group : List.of(today, study)) {
            groupMemberRepository.save(GroupMember.createLeader(group, leader, NOW));
            GroupRecruitment recruitment = recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.AUTO, 10, NOW.minusDays(1), null));
            registrationRepository.save(Registration.createAutoApproved(recruitment, leader, null, NOW, 0));
        }
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean previouslyEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            var oldToday = groupQueryService.findGroups(new GroupListQuery(GroupStatus.ACTIVE, null, null,
                    GroupType.SESSION, null, DATE, null, null, null, 100));
            var oldRecruiting = groupQueryService.findGroups(new GroupListQuery(GroupStatus.ACTIVE, null, null,
                    null, null, null, true, null, null, 4));
            var oldEnded = groupQueryService.findGroups(new GroupListQuery(GroupStatus.ENDED, null, null,
                    null, null, null, null, null, null, 4));
            long oldStatements = statistics.getPrepareStatementCount();
            statistics.clear();

            // When
            var home = groupQueryService.findHome(new HomeQuery(DATE));

            // Then
            assertThat(home.today()).isEqualTo(oldToday);
            assertThat(home.recruiting()).isEqualTo(oldRecruiting);
            assertThat(home.ended()).isEqualTo(oldEnded);
            assertThat(oldStatements).isEqualTo(11);
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(6);
            assertThat(statistics.getEntityStatistics(Member.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getEntityStatistics(GroupMember.class.getName()).getLoadCount()).isZero();
            System.out.println("HOME_SQL_COUNTS old=" + oldStatements + " home=" + statistics.getPrepareStatementCount());
        } finally {
            statistics.setStatisticsEnabled(previouslyEnabled);
        }
    }

    @DisplayName("빈 홈은 기본 목록 SQL 세 개만 실행한다.")
    @Test
    void skipsReferenceQueriesForEmptyHome() {
        // Given
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean previouslyEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            // When
            groupQueryService.findHome(new HomeQuery(DATE));

            // Then
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
            System.out.println("HOME_EMPTY_SQL_COUNT=" + statistics.getPrepareStatementCount());
        } finally {
            statistics.setStatisticsEnabled(previouslyEnabled);
        }
    }

    @DisplayName("홈의 각 목록이 페이지 크기와 같으면 다음 커서가 없다.")
    @Test
    void omitsCursorsAtExactPageSizes() {
        // Given
        for (int index = 0; index < 100; index++) {
            Group group = saveSession("정확한오늘모임" + index, DATE);
            if (index < 4) {
                recruitmentRepository.save(GroupRecruitment.create(group, JoinMethod.AUTO, 1, NOW, null));
                groupRepository.save(Group.createStudy("정확한종료모임" + index, "종료된 모임", null, null, null,
                        NOW.minusDays(2)).endAt(NOW));
            }
        }

        // When / Then
        RestAssured.given().queryParam("sessionDate", DATE.toString()).get("/home")
                .then().statusCode(200)
                .body("data.today.items.size()", equalTo(100))
                .body("data.recruiting.items.size()", equalTo(4))
                .body("data.ended.items.size()", equalTo(4))
                .body("data.today.hasNext", equalTo(false))
                .body("data.recruiting.hasNext", equalTo(false))
                .body("data.ended.hasNext", equalTo(false))
                .body("data.today.nextCursor", nullValue())
                .body("data.recruiting.nextCursor", nullValue())
                .body("data.ended.nextCursor", nullValue());
    }

    @DisplayName("오늘 목록이 비어도 모집 자격과 최신 활성 모집의 표시를 보존한다.")
    @Test
    void preservesEligibilityAndLatestRecruitmentWhenTodayIsEmpty() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "eligibility-member", Course.BACKEND));
        Group olderEligible = groupRepository.save(Group.createStudy("이전모집가능", "모집하는 모임", null, null, null, NOW));
        recruitmentRepository.save(GroupRecruitment.create(olderEligible, JoinMethod.AUTO, 1, NOW.minusDays(1), null));
        GroupRecruitment latestFull = recruitmentRepository.save(GroupRecruitment.create(
                olderEligible, JoinMethod.AUTO, 1, NOW, null));
        registrationRepository.save(Registration.createAutoApproved(latestFull, member, null, NOW, 0));
        Group startingNow = groupRepository.save(Group.createStudy("지금모집시작", "모집하는 모임", null, null, null, NOW));
        GroupRecruitment invitationRecruitment = recruitmentRepository.save(GroupRecruitment.create(
                startingNow, JoinMethod.APPROVAL, 1, NOW, null));
        registrationRepository.save(Registration.createPending(invitationRecruitment, member, null, NOW).approveByInvitation(NOW));
        GroupRecruitment latestPending = recruitmentRepository.save(GroupRecruitment.create(
                startingNow, JoinMethod.APPROVAL, 1, NOW, null));
        registrationRepository.save(Registration.createPending(latestPending, member, null, NOW));
        Group ended = groupRepository.save(Group.createStudy("빈오늘종료", "종료된 모임", null, null, null, NOW.minusDays(2)).endAt(NOW));

        // When
        var home = RestAssured.given().queryParam("sessionDate", DATE.toString()).get("/home")
                .then().statusCode(200).extract().jsonPath();
        Map<String, Object> existing = RestAssured.given()
                .queryParams(Map.of("status", "ACTIVE", "recruiting", true, "size", 4)).get("/groups")
                .then().statusCode(200).extract().jsonPath().getMap("data");

        // Then
        assertThat(home.getList("data.today.items")).isEmpty();
        assertThat(home.getMap("data.recruiting")).isEqualTo(existing);
        assertThat(home.<Integer>getList("data.recruiting.items.id"))
                .containsExactly(startingNow.getId().intValue(), olderEligible.getId().intValue());
        assertThat(home.getLong("data.recruiting.items[0].activeRecruitment.id")).isEqualTo(latestPending.getId());
        assertThat(home.getInt("data.recruiting.items[0].activeRecruitment.approvedCount")).isZero();
        assertThat(home.getLong("data.recruiting.items[1].activeRecruitment.id")).isEqualTo(latestFull.getId());
        assertThat(home.getInt("data.recruiting.items[1].activeRecruitment.approvedCount")).isEqualTo(1);
        assertThat(home.<Integer>getList("data.ended.items.id")).containsExactly(ended.getId().intValue());
    }

    private Group saveSession(String name, LocalDate date) {
        return groupRepository.save(Group.createSession(name, "함께하는 모임", null, null,
                SessionGroupSchedule.of(date, LocalTime.NOON, LocalTime.of(13, 0)), NOW.minusDays(2)));
    }

    private void assertSection(Map<String, Object> section, Map<String, Object> filters) {
        Map<String, Object> existing = RestAssured.given().queryParams(filters).get("/groups")
                .then().statusCode(200).extract().jsonPath().getMap("data");
        assertThat(section).isEqualTo(existing);
        assertThat(section.get("hasNext")).isEqualTo(true);
        RestAssured.given().queryParams(filters).queryParam("cursor", section.get("nextCursor")).get("/groups")
                .then().statusCode(200)
                .body("data.items.size()", equalTo(1))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue());
    }
}
