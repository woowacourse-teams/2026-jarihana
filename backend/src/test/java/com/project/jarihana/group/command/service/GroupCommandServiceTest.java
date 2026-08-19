package com.project.jarihana.group.command.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.command.service.dto.CreateGroupResult;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupCommandServiceTest extends IntegrationTestSupport {

    @Autowired
    private GroupCommandService groupCommandService;

    @Autowired
    private GroupCommandRepository groupCommandRepository;

    @Autowired
    private GroupMemberCommandRepository groupMemberCommandRepository;

    @Autowired
    private MemberRepository memberRepository;

    @DisplayName("가입 완료 회원은 기본 이미지가 설정된 그룹과 모임장 역할을 함께 생성한다.")
    @Test
    void createGroupWithLeaderAndDefaultImage() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, "github-123", Course.BACKEND));
        CreateGroupCommand command = new CreateGroupCommand(
                GroupType.STUDY,
                "알고리즘 스터디",
                "매주 함께 문제를 풉니다.",
                "문제 풀이와 코드 리뷰를 진행합니다.",
                new CreateGroupCommand.RecurringSchedule(
                        Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY),
                        LocalTime.of(19, 0),
                        LocalTime.of(21, 0)
                ),
                null
        );

        // When
        CreateGroupResult result = groupCommandService.createGroup(member.getId(), command);

        // Then
        Group group = groupCommandRepository.findById(result.id()).orElseThrow();
        assertThat(result.status()).isEqualTo(GroupStatus.ACTIVE);
        assertThat(group.getRepresentativeImageKey()).isEqualTo("images/default-group.png");
        assertThat(groupMemberCommandRepository.findByGroupAndMember(group, member))
                .hasValueSatisfying(groupMember -> assertThat(groupMember.getRole()).isEqualTo(GroupMemberRole.LEADER));
    }

    @DisplayName("존재하지 않는 회원은 그룹을 개설할 수 없다.")
    @Test
    void createGroupFailsWhenMemberDoesNotExist() {
        assertThatThrownBy(() -> groupCommandService.createGroup(999_999L, recurringCommand("없는 회원 그룹")))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.MEMBER_NOT_FOUND);
    }

    @DisplayName("이미 사용 중인 이름으로 그룹을 개설할 수 없다.")
    @Test
    void createGroupFailsWhenNameIsDuplicated() {
        Member member = saveMember("github-duplicate");
        groupCommandService.createGroup(member.getId(), recurringCommand("중복 그룹"));

        assertThatThrownBy(() -> groupCommandService.createGroup(member.getId(), recurringCommand("중복 그룹")))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_NAME_DUPLICATED);
    }

    @DisplayName("세션 그룹에 일회성 일정이 없으면 개설할 수 없다.")
    @Test
    void createSessionGroupFailsWhenScheduleIsMissing() {
        Member member = saveMember("github-session-missing");
        CreateGroupCommand command = new CreateGroupCommand(
                GroupType.SESSION, "세션 그룹", "소개", "설명", null, null);

        assertThatThrownBy(() -> groupCommandService.createGroup(member.getId(), command))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.SCHEDULE_REQUIRED);
    }

    @DisplayName("정기 그룹에 일회성 일정을 전달하면 개설할 수 없다.")
    @Test
    void createRecurringGroupFailsWhenSessionScheduleIsProvided() {
        Member member = saveMember("github-schedule-mismatch");
        CreateGroupCommand command = new CreateGroupCommand(
                GroupType.STUDY, "일정 불일치 그룹", "소개", "설명",
                null, new CreateGroupCommand.SessionSchedule(
                        LocalDate.now().plusDays(1), LocalTime.of(10, 0), LocalTime.of(11, 0)));

        assertThatThrownBy(() -> groupCommandService.createGroup(member.getId(), command))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.SCHEDULE_TYPE_MISMATCH);
    }

    @DisplayName("시작 시각이 종료 시각보다 늦으면 일정이 유효하지 않다.")
    @Test
    void createGroupFailsWhenScheduleRuleIsInvalid() {
        Member member = saveMember("github-invalid-schedule");
        CreateGroupCommand command = new CreateGroupCommand(
                GroupType.STUDY, "잘못된 일정 그룹", "소개", "설명",
                new CreateGroupCommand.RecurringSchedule(
                        Set.of(DayOfWeek.MONDAY), LocalTime.of(21, 0), LocalTime.of(19, 0)), null);

        assertThatThrownBy(() -> groupCommandService.createGroup(member.getId(), command))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.SCHEDULE_INVALID_RULE);
    }

    @DisplayName("정기 그룹에 일정이 없으면 개설할 수 없다.")
    @Test
    void createRecurringGroupFailsWhenScheduleIsMissing() {
        Member member = saveMember("github-recurring-missing");
        CreateGroupCommand command = new CreateGroupCommand(
                GroupType.CLUB, "정기 일정 누락 그룹", "소개", "설명", null, null);

        assertThatThrownBy(() -> groupCommandService.createGroup(member.getId(), command))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.SCHEDULE_REQUIRED);
    }

    private Member saveMember(String githubId) {
        return memberRepository.save(Member.create("가온", 8, githubId, Course.BACKEND));
    }

    private CreateGroupCommand recurringCommand(String name) {
        return new CreateGroupCommand(
                GroupType.STUDY, name, "소개", "설명",
                new CreateGroupCommand.RecurringSchedule(
                        Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)), null);
    }
}
