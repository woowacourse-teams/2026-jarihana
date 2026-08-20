package com.project.jarihana.group.query.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupQueryControllerTest extends IntegrationTestSupport {

    private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private GroupJpaRepository groupRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberRepository;

    @Autowired
    private GroupRecruitmentJpaRepository recruitmentRepository;

    @Autowired
    private RegistrationJpaRepository registrationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @BeforeEach
    void setUp() {
        clearGroups();
    }

    @DisplayName("활성 그룹을 커서 페이지로 조회한다.")
    @Test
    void findsActiveGroupsWithCursorPagination() {
        // Given
        saveGroupListFixtures();

        // When
        String nextCursor = given()
                .queryParam("size", 1)
                .when()
                .get("/api/groups")
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].status", equalTo("ACTIVE"))
                .body("data.items[0].name", equalTo("알고리즘 스터디"))
                .body("data.items[0].representativeImageUrl", equalTo("images/default-group.png"))
                .body("data.items[0].memberCount", equalTo(1))
                .body("data.items[0].leader.crewName", equalTo("가온"))
                .body("data.hasNext", equalTo(true))
                .body("data.nextCursor", not(emptyOrNullString()))
                .body("error", nullValue())
                .extract()
                .path("data.nextCursor");

        // Then
        given()
                .queryParam("cursor", nextCursor)
                .queryParam("size", 1)
                .when()
                .get("/api/groups")
                .then()
                .statusCode(200)
                .body("data.items[0].name", equalTo("오래된 스터디"))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue());
    }

    @DisplayName("범위를 벗어난 그룹 목록 크기는 400을 반환한다.")
    @Test
    void rejectsInvalidSize() {
        // Given / When / Then
        given()
                .queryParam("size", 101)
                .when()
                .get("/api/groups")
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"))
                .body("error.message", equalTo("요청 파라미터가 올바르지 않습니다."));
    }

    @DisplayName("잘못된 열거형과 불리언 파라미터는 공통 오류를 반환한다.")
    @Test
    void rejectsInvalidEnumAndBooleanParametersWithCommonError() {
        // Given / When / Then
        given()
                .queryParam("type", "INVALID")
                .queryParam("recruiting", "not-boolean")
                .when()
                .get("/api/groups")
                .then()
                .statusCode(400)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("INVALID_PARAMETER"))
                .body("error.message", equalTo("요청 파라미터가 올바르지 않습니다."));
    }

    @DisplayName("관계 필터를 사용하려면 인증이 필요하다.")
    @Test
    void requiresAuthenticationForRelationFilter() {
        // Given / When / Then
        given()
                .queryParam("relation", "joined")
                .when()
                .get("/api/groups")
                .then()
                .statusCode(401)
                .body("success", equalTo(false))
                .body("error.code", equalTo("UNAUTHENTICATED"))
                .body("error.message", equalTo("인증 정보가 필요합니다."));
    }

    @DisplayName("기본 그룹 이미지를 공개 정적 리소스로 제공한다.")
    @Test
    void servesDefaultGroupImage() {
        // Given / When / Then
        given()
                .when()
                .get("/images/default-group.png")
                .then()
                .statusCode(200)
                .contentType("image/png");
    }

    @DisplayName("인증된 회원을 기준으로 관계와 역할 필터를 적용한다.")
    @Test
    void filtersGroupsByAuthenticatedMemberRelationAndRole() {
        // Given
        Group leaderGroup = groupRepository.save(
                study("내가 모임장인 스터디", "함께 공부합니다.", CREATED_AT)
        );
        Group memberGroup = groupRepository.save(
                study("내가 참여한 스터디", "함께 복습합니다.", CREATED_AT.minusHours(1))
        );
        groupRepository.save(study("참여하지 않은 스터디", "새로운 모임입니다.", CREATED_AT.minusHours(2)));
        Member currentMember = memberRepository.save(Member.create("가온", 8, "github-current", Course.BACKEND));
        groupMemberRepository.save(GroupMember.createLeader(leaderGroup, currentMember, CREATED_AT));
        groupMemberRepository.save(GroupMember.createMember(memberGroup, currentMember, CREATED_AT));
        String accessToken = accessTokenProvider.issue(currentMember.getId()).value();

        // When / Then
        given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .queryParam("relation", "joined")
                .queryParam("role", "LEADER")
                .when()
                .get("/api/groups")
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.items.size()", equalTo(1))
                .body("data.items[0].name", equalTo("내가 모임장인 스터디"))
                .body("error", nullValue());
    }

    @DisplayName("반복 일정 그룹의 상세 정보를 조회한다.")
    @Test
    void findsRecurringGroupDetail() {
        // Given
        Group group = groupRepository.save(Group.createStudy(
                "알고리즘 스터디",
                "매주 함께 문제를 풉니다.",
                "문제 풀이와 코드 리뷰를 진행합니다.",
                "groups/1.webp",
                RecurringGroupSchedule.of(
                        Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                CREATED_AT
        ));
        Member leader = memberRepository.save(Member.create("가온", 8, "github-1", Course.BACKEND));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, CREATED_AT));
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                8,
                now.minusHours(1),
                now.plusDays(1)
        ));

        // When / Then
        given()
                .when()
                .get("/api/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.id", equalTo(group.getId().intValue()))
                .body("data.type", equalTo("STUDY"))
                .body("data.status", equalTo("ACTIVE"))
                .body("data.name", equalTo("알고리즘 스터디"))
                .body("data.description", equalTo("문제 풀이와 코드 리뷰를 진행합니다."))
                .body("data.representativeImageUrl", equalTo("images/default-group.png"))
                .body("data.recurringSchedule.daysOfWeek", hasItems("MONDAY", "WEDNESDAY"))
                .body("data.recurringSchedule.startTime", equalTo("19:00:00"))
                .body("data.sessionSchedule", nullValue())
                .body("data.leader.memberId", equalTo(leader.getId().intValue()))
                .body("data.leader.crewName", equalTo("가온"))
                .body("data.memberCount", equalTo(1))
                .body("data.activeRecruitment.joinMethod", equalTo("APPROVAL"))
                .body("data.activeRecruitment.capacity", equalTo(8))
                .body("data.activeRecruitment.approvedCount", equalTo(0))
                .body("error", nullValue());
    }

    @DisplayName("Hard Delete된 구성원은 그룹 상세 인원 수에서 제외한다.")
    @Test
    void excludesHardDeletedMemberFromGroupDetail() {
        // Given
        Group group = groupRepository.save(study("구성원 삭제 스터디", "함께 학습합니다.", CREATED_AT));
        Member leader = memberRepository.save(Member.create("가온", 8, "github-4", Course.BACKEND));
        Member leavingMember = memberRepository.save(Member.create("마루", 8, "github-5", Course.FRONTEND));
        groupMemberRepository.save(GroupMember.createLeader(group, leader, CREATED_AT));
        GroupMember savedLeavingMember = groupMemberRepository.save(
                GroupMember.createMember(group, leavingMember, CREATED_AT.plusHours(1))
        );
        groupMemberRepository.delete(savedLeavingMember);
        groupMemberRepository.flush();

        // When / Then
        given()
                .when()
                .get("/api/groups/{groupId}", group.getId())
                .then()
                .statusCode(200)
                .body("data.memberCount", equalTo(1))
                .body("data.leader.memberId", equalTo(leader.getId().intValue()));
    }

    @DisplayName("세션 그룹과 종료된 그룹도 상세 정보를 조회한다.")
    @Test
    void findsSessionAndEndedGroupDetail() {
        // Given
        Group group = groupRepository.save(Group.createSession(
                "우테코 네트워킹",
                "한 번 만나는 모임입니다.",
                null,
                null,
                SessionGroupSchedule.of(
                        LocalDate.of(2026, 8, 30),
                        LocalTime.of(14, 0),
                        LocalTime.of(16, 0)
                ),
                CREATED_AT
        ));
        Group endedGroup = groupRepository.save(group.endAt(CREATED_AT.plusDays(1).plusMinutes(1)));

        // When / Then
        given()
                .when()
                .get("/api/groups/{groupId}", endedGroup.getId())
                .then()
                .statusCode(200)
                .body("success", equalTo(true))
                .body("data.type", equalTo("SESSION"))
                .body("data.status", equalTo("ENDED"))
                .body("data.recurringSchedule", nullValue())
                .body("data.sessionSchedule.sessionDate", equalTo("2026-08-30"))
                .body("data.sessionSchedule.startTime", equalTo("14:00:00"));
    }

    @DisplayName("존재하지 않는 그룹을 조회하면 404를 반환한다.")
    @Test
    void rejectsUnknownGroup() {
        // Given / When / Then
        given()
                .when()
                .get("/api/groups/{groupId}", 999L)
                .then()
                .statusCode(404)
                .body("success", equalTo(false))
                .body("data", nullValue())
                .body("error.code", equalTo("GROUP_NOT_FOUND"))
                .body("error.message", equalTo("그룹을 찾을 수 없습니다."));
    }

    private void saveGroupListFixtures() {
        Group firstGroup = study("알고리즘 스터디", "함께 문제를 풉니다.", CREATED_AT);
        Group endedGroup = study("종료된 스터디", "지난 활동입니다.", CREATED_AT.minusDays(1));
        Group oldGroup = study("오래된 스터디", "문제를 복습합니다.", CREATED_AT.minusHours(1));
        Member leader = Member.create("가온", 8, "github-3", Course.BACKEND);

        groupRepository.save(oldGroup);
        groupRepository.save(endedGroup.endAt(CREATED_AT.plusMinutes(1)));
        Group savedFirstGroup = groupRepository.save(firstGroup);
        Member savedLeader = memberRepository.save(leader);
        groupMemberRepository.save(GroupMember.createLeader(savedFirstGroup, savedLeader, CREATED_AT));
    }

    private static Group study(String name, String introduction, LocalDateTime createdAt) {
        return Group.createStudy(
                name,
                introduction,
                null,
                "groups/1.webp",
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.NOON, LocalTime.of(13, 0)),
                createdAt
        );
    }

    private void clearGroups() {
        registrationRepository.deleteAllInBatch();
        recruitmentRepository.deleteAllInBatch();
        groupMemberRepository.deleteAllInBatch();
        groupRepository.deleteAllInBatch();
    }
}
