package com.project.jarihana.group.query.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.group.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.repository.MemberRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.support.IntegrationTestSupport;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupDetailControllerTest extends IntegrationTestSupport {

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

    @BeforeEach
    void setUp() {
        registrationRepository.deleteAllInBatch();
        recruitmentRepository.deleteAllInBatch();
        groupMemberRepository.deleteAllInBatch();
        groupRepository.deleteAllInBatch();
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
        recruitmentRepository.save(GroupRecruitment.create(
                group,
                JoinMethod.APPROVAL,
                8,
                CREATED_AT.minusHours(1),
                CREATED_AT.plusDays(1)
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
                .body("data.representativeImageUrl", equalTo("groups/1.webp"))
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
}
