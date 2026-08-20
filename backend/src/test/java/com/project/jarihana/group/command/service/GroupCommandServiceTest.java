package com.project.jarihana.group.command.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.command.service.dto.CreateGroupResult;
import com.project.jarihana.group.command.service.dto.ModifyGroupCommand;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.group.query.repository.GroupMemberJpaRepository;
import com.project.jarihana.recruitment.query.repository.GroupRecruitmentJpaRepository;
import com.project.jarihana.group.query.repository.RegistrationJpaRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;

class GroupCommandServiceTest extends IntegrationTestSupport {

    @Autowired
    private GroupCommandService groupCommandService;

    @Autowired
    private GroupCommandRepository groupCommandRepository;

    @Autowired
    private GroupMemberCommandRepository groupMemberCommandRepository;

    @Autowired
    private GroupJpaRepository groupJpaRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberJpaRepository;

    @Autowired
    private GroupRecruitmentJpaRepository groupRecruitmentJpaRepository;

    @Autowired
    private RegistrationJpaRepository registrationJpaRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

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

    @DisplayName("모임장은 그룹 기본 정보를 전체 교체하고 일정은 유지한다.")
    @Test
    void modifyGroupReplacesBasicInformation() {
        // Given
        Member leader = saveMember("github-modify-leader");
        Group group = createGroup(leader, "서비스 기존 그룹");
        ModifyGroupCommand command = new ModifyGroupCommand(
                "새 그룹", "새 한 줄 소개", null);

        // When
        groupCommandService.modifyGroup(leader.getId(), group.getId(), command);

        // Then
        Group modified = groupCommandRepository.findById(group.getId()).orElseThrow();
        assertThat(modified.getName()).isEqualTo("새 그룹");
        assertThat(modified.getIntroduction()).isEqualTo("새 한 줄 소개");
        assertThat(modified.getDescription()).isNull();
        assertThat(modified.getRepresentativeImageKey())
                .isEqualTo(GroupCommandService.DEFAULT_REPRESENTATIVE_IMAGE_KEY);
        assertThat(modified.getRecurringSchedule()).isNotNull();
    }

    @DisplayName("모임장이 아닌 구성원은 그룹 기본 정보를 교체할 수 없다.")
    @Test
    void modifyGroupFailsForNonLeader() {
        // Given
        Member leader = saveMember("github-modify-owner");
        Member member = memberRepository.save(Member.create("누리", 8, "github-modify-member", Course.BACKEND));
        Group group = createGroup(leader, "권한 그룹");
        groupMemberCommandRepository.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> groupCommandService.modifyGroup(
                member.getId(), group.getId(), new ModifyGroupCommand("변경", "소개", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("종료된 그룹은 기본 정보를 교체할 수 없다.")
    @Test
    void modifyGroupFailsForEndedGroup() {
        // Given
        Member leader = saveMember("github-modify-ended");
        Group group = createGroup(leader, "종료 그룹");
        groupCommandRepository.save(group.endAt(TestSupportConfig.FIXED_NOW.plusDays(1).plusMinutes(1)));

        // When / Then
        assertThatThrownBy(() -> groupCommandService.modifyGroup(
                leader.getId(), group.getId(), new ModifyGroupCommand("변경", "소개", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ENDED);
    }

    @DisplayName("다른 그룹이 사용 중인 이름으로 기본 정보를 교체할 수 없다.")
    @Test
    void modifyGroupFailsForDuplicatedName() {
        // Given
        Member leader = saveMember("github-modify-duplicate");
        Group group = createGroup(leader, "내 그룹");
        Group another = groupCommandRepository.save(Group.createStudy(
                "다른 그룹", "소개", null, null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> groupCommandService.modifyGroup(
                leader.getId(), group.getId(), new ModifyGroupCommand(another.getName(), "소개", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_NAME_DUPLICATED);
    }

    @DisplayName("생성 후 24시간 이내 그룹은 연관 데이터와 함께 완전히 삭제한다.")
    @Test
    void deleteGroupHardDeletesGroupAndRelations() {
        // Given
        Member leader = saveMember("github-delete-leader");
        Member applicant = memberRepository.save(Member.create("누리", 8, "github-delete-applicant", Course.BACKEND));
        Group group = createGroup(leader, "삭제 대상 그룹");
        GroupRecruitment recruitment = groupRecruitmentJpaRepository.save(GroupRecruitment.create(
                group, JoinMethod.APPROVAL, 3,
                TestSupportConfig.FIXED_NOW.minusHours(1), TestSupportConfig.FIXED_NOW.plusHours(1)));
        Registration registration = registrationJpaRepository.save(Registration.createPending(
                recruitment, applicant, "참여하고 싶습니다.", TestSupportConfig.FIXED_NOW));

        // When
        groupCommandService.deleteGroup(leader.getId(), group.getId());

        // Then
        assertThat(groupJpaRepository.findById(group.getId())).isEmpty();
        assertThat(groupRecruitmentJpaRepository.findById(recruitment.getId())).isEmpty();
        assertThat(registrationJpaRepository.findById(registration.getId())).isEmpty();
        assertThat(groupMemberJpaRepository.findAllByGroup_IdInOrderById(List.of(group.getId()))).isEmpty();
    }

    @DisplayName("생성 후 24시간이 지난 그룹은 삭제할 수 없다.")
    @Test
    void deleteGroupFailsAfterDeleteWindow() {
        // Given
        Member leader = saveMember("github-delete-expired");
        LocalDateTime createdAt = TestSupportConfig.FIXED_NOW.minusHours(24).minusMinutes(1);
        Group group = groupJpaRepository.save(Group.createStudy(
                "삭제 기간 만료 그룹", "소개", null, GroupCommandService.DEFAULT_REPRESENTATIVE_IMAGE_KEY,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)),
                createdAt));
        groupMemberCommandRepository.save(GroupMember.createLeader(group, leader, createdAt));
        jdbcTemplate.update(
                "UPDATE groups SET created_at = ?, updated_at = ? WHERE id = ?",
                createdAt, createdAt, group.getId());
        entityManager.clear();

        // When / Then
        assertThatThrownBy(() -> groupCommandService.deleteGroup(leader.getId(), group.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_DELETE_WINDOW_EXPIRED);
    }

    @DisplayName("종료된 그룹은 삭제할 수 없다.")
    @Test
    void deleteGroupFailsForEndedGroup() {
        // Given
        Member leader = saveMember("github-delete-ended");
        Group group = createGroup(leader, "종료된 삭제 그룹");
        groupJpaRepository.save(group.endAt(LocalDateTime.now().plusDays(2)));

        // When / Then
        assertThatThrownBy(() -> groupCommandService.deleteGroup(leader.getId(), group.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ENDED);
    }

    @DisplayName("모임장이 아닌 구성원은 그룹을 삭제할 수 없다.")
    @Test
    void deleteGroupFailsForNonLeader() {
        // Given
        Member leader = saveMember("github-delete-owner");
        Member member = memberRepository.save(Member.create("누리", 8, "github-delete-member", Course.BACKEND));
        Group group = createGroup(leader, "삭제 권한 그룹");
        groupMemberCommandRepository.save(GroupMember.createMember(group, member, TestSupportConfig.FIXED_NOW));

        // When / Then
        assertThatThrownBy(() -> groupCommandService.deleteGroup(member.getId(), group.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_ACCESS_DENIED);
    }

    @DisplayName("존재하지 않는 그룹은 삭제할 수 없다.")
    @Test
    void deleteGroupFailsForUnknownGroup() {
        // Given
        Member leader = saveMember("github-delete-unknown");

        // When / Then
        assertThatThrownBy(() -> groupCommandService.deleteGroup(leader.getId(), 999_999L))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_NOT_FOUND);
    }

    private Member saveMember(String githubId) {
        return memberRepository.save(Member.create("가온", 8, githubId, Course.BACKEND));
    }

    private Group createGroup(Member leader, String name) {
        CreateGroupResult result = groupCommandService.createGroup(leader.getId(), recurringCommand(name));
        return groupCommandRepository.findById(result.id()).orElseThrow();
    }

    private CreateGroupCommand recurringCommand(String name) {
        return new CreateGroupCommand(
                GroupType.STUDY, name, "소개", "설명",
                new CreateGroupCommand.RecurringSchedule(
                        Set.of(DayOfWeek.MONDAY), LocalTime.of(19, 0), LocalTime.of(21, 0)), null);
    }
}
