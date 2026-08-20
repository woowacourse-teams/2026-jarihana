package com.project.jarihana.group.query.controller;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.group.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Transactional
class GroupListControllerTest {

    private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Autowired
    private MockMvc mockMvc;

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
        clearGroups();
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

    @Test
    void findsActiveGroupsWithCursorPagination() throws Exception {
        MvcResult firstPage = mockMvc.perform(get("/api/groups").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").isNumber())
                .andExpect(jsonPath("$.data.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.data.items[0].name").value("알고리즘 스터디"))
                .andExpect(jsonPath("$.data.items[0].memberCount").value(1))
                .andExpect(jsonPath("$.data.items[0].leader.memberId").isNumber())
                .andExpect(jsonPath("$.data.items[0].leader.crewName").value("가온"))
                .andExpect(jsonPath("$.data.hasNext").value(true))
                .andExpect(jsonPath("$.data.nextCursor").isNotEmpty())
                .andExpect(jsonPath("$.error").value(nullValue()))
                .andReturn();

        String nextCursor = JsonPath.read(
                firstPage.getResponse().getContentAsString(),
                "$.data.nextCursor"
        );
        mockMvc.perform(get("/api/groups").queryParam("cursor", nextCursor).queryParam("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].name").value("오래된 스터디"))
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.nextCursor").value(nullValue()));
    }

    @Test
    void rejectsInvalidSize() throws Exception {
        // Given
        // When / Then
        mockMvc.perform(get("/api/groups").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data").value(nullValue()))
                .andExpect(jsonPath("$.error.code").value("INVALID_PARAMETER"))
                .andExpect(jsonPath("$.error.message").value("요청 파라미터가 올바르지 않습니다."));
    }

    @Test
    void rejectsInvalidEnumAndBooleanParametersWithCommonError() throws Exception {
        // Given
        // When / Then
        mockMvc.perform(get("/api/groups")
                        .param("type", "INVALID")
                        .param("recruiting", "not-boolean"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data").value(nullValue()))
                .andExpect(jsonPath("$.error.code").value("INVALID_PARAMETER"))
                .andExpect(jsonPath("$.error.message").value("요청 파라미터가 올바르지 않습니다."));
    }

    @Test
    void requiresAuthenticationForRelationFilter() throws Exception {
        // Given
        // When / Then
        mockMvc.perform(get("/api/groups").param("relation", "joined"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.error.message").value("인증 정보가 필요합니다."));
    }

    private static Group study(String name, String introduction, LocalDateTime createdAt) {
        return Group.createStudy(
                name,
                introduction,
                null,
                null,
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
