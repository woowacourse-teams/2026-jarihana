package com.project.jarihana.group.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.command.service.dto.CreateGroupCommand;
import com.project.jarihana.group.command.service.dto.CreateGroupResult;
import com.project.jarihana.group.command.service.dto.ModifyGroupCommand;
import com.project.jarihana.group.command.service.dto.TerminateGroupCommand;
import com.project.jarihana.group.command.service.dto.TerminateGroupResult;
import com.project.jarihana.group.command.service.dto.ReplaceRecurringScheduleCommand;
import com.project.jarihana.group.command.service.dto.ReplaceRecurringScheduleResult;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GroupCommandService {

    public static final String DEFAULT_REPRESENTATIVE_IMAGE_KEY = "images/default-group.png";

    private static final String MEMBER_NOT_FOUND_MESSAGE = "회원 정보를 찾을 수 없습니다.";
    private static final String GROUP_NAME_DUPLICATED_MESSAGE = "이미 사용 중인 그룹 이름입니다.";
    private static final String GROUP_NOT_FOUND_MESSAGE = "그룹을 찾을 수 없습니다.";
    private static final String GROUP_ACCESS_DENIED_MESSAGE = "그룹 모임장만 수정할 수 있습니다.";
    private static final String GROUP_ENDED_MESSAGE = "종료된 그룹은 수정할 수 없습니다.";
    private static final String GROUP_DELETE_WINDOW_EXPIRED_MESSAGE = "그룹 생성 후 24시간 이내에만 삭제할 수 있습니다.";
    private static final String SCHEDULE_TYPE_MISMATCH_MESSAGE = "그룹 유형에 맞는 일정만 등록할 수 있습니다.";
    private static final String SCHEDULE_REQUIRED_MESSAGE = "세션 그룹에는 일회성 일정이 필요합니다.";
    private static final String SCHEDULE_INVALID_RULE_MESSAGE = "일정 형식이 올바르지 않습니다.";

    private final MemberRepository memberRepository;
    private final GroupCommandRepository groupCommandRepository;
    private final GroupMemberCommandRepository groupMemberCommandRepository;
    private final GroupRecruitmentCommandRepository groupRecruitmentCommandRepository;
    private final RegistrationCommandRepository registrationCommandRepository;
    private final Clock clock;

    public GroupCommandService(
            MemberRepository memberRepository,
            GroupCommandRepository groupCommandRepository,
            GroupMemberCommandRepository groupMemberCommandRepository,
            GroupRecruitmentCommandRepository groupRecruitmentCommandRepository,
            RegistrationCommandRepository registrationCommandRepository,
            Clock clock
    ) {
        this.memberRepository = memberRepository;
        this.groupCommandRepository = groupCommandRepository;
        this.groupMemberCommandRepository = groupMemberCommandRepository;
        this.groupRecruitmentCommandRepository = groupRecruitmentCommandRepository;
        this.registrationCommandRepository = registrationCommandRepository;
        this.clock = clock;
    }

    @Transactional
    public CreateGroupResult createGroup(Long memberId, CreateGroupCommand command) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));
        if (groupCommandRepository.existsByName(command.name())) {
            throw new BusinessException(ErrorCode.GROUP_NAME_DUPLICATED, GROUP_NAME_DUPLICATED_MESSAGE);
        }

        LocalDateTime now = LocalDateTime.now(clock);
        Group group = groupCommandRepository.save(createGroup(command, now));
        GroupMember leader = GroupMember.createLeader(group, member, now);
        groupMemberCommandRepository.save(leader);
        return new CreateGroupResult(group.getId(), group.getStatus());
    }

    @Transactional
    public void modifyGroup(Long memberId, Long groupId, ModifyGroupCommand command) {
        Group group = groupCommandRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));
        GroupMember groupMember = groupMemberCommandRepository.findByGroupAndMember(group, member)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE);
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, GROUP_ENDED_MESSAGE);
        }
        if (groupCommandRepository.existsByNameAndIdNot(command.name(), groupId)) {
            throw new BusinessException(ErrorCode.GROUP_NAME_DUPLICATED, GROUP_NAME_DUPLICATED_MESSAGE);
        }
        groupCommandRepository.save(group.modify(
                command.name(),
                command.introduction(),
                command.description(),
                DEFAULT_REPRESENTATIVE_IMAGE_KEY,
                group.getRecurringSchedule(),
                group.getSessionSchedule()
        ));
    }

    @Transactional
    public void deleteGroup(Long memberId, Long groupId) {
        Group group = groupCommandRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));
        GroupMember groupMember = groupMemberCommandRepository.findByGroupAndMember(group, member)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE);
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, GROUP_ENDED_MESSAGE);
        }
        if (!group.canDeleteAt(LocalDateTime.now(clock))) {
            throw new BusinessException(
                    ErrorCode.GROUP_DELETE_WINDOW_EXPIRED,
                    GROUP_DELETE_WINDOW_EXPIRED_MESSAGE
            );
        }
        registrationCommandRepository.deleteAllByRecruitment_Group_Id(groupId);
        groupRecruitmentCommandRepository.deleteAllByGroup_Id(groupId);
        groupMemberCommandRepository.deleteAllByGroup_Id(groupId);
        groupCommandRepository.delete(group);
    }

    @Transactional
    public TerminateGroupResult terminateGroup(Long memberId, Long groupId, TerminateGroupCommand command) {
        Group group = groupCommandRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));
        GroupMember groupMember = groupMemberCommandRepository.findByGroupAndMember(group, member)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE);
        }
        if (command.status() != GroupStatus.ENDED) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "종료 시 상태는 ENDED여야 합니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ALREADY_ENDED, "이미 종료된 그룹입니다.");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        if (!group.canEndAt(now)) {
            throw new BusinessException(
                    ErrorCode.GROUP_TERMINATION_NOT_AVAILABLE,
                    "그룹 생성 후 24시간이 지나야 종료할 수 있습니다."
            );
        }

        for (GroupRecruitment recruitment : groupRecruitmentCommandRepository.findAllByGroup_Id(groupId)) {
            if (!recruitment.isOpenAt(now)) {
                continue;
            }
            groupRecruitmentCommandRepository.save(recruitment.closeAt(now));
            for (Registration registration : registrationCommandRepository
                    .findAllByRecruitment_Group_IdAndStatus(groupId, RegistrationStatus.PENDING)) {
                if (registration.getRecruitment().equals(recruitment)) {
                    registrationCommandRepository.save(registration.rejectBySystem("그룹 종료", now));
                }
            }
        }
        groupCommandRepository.save(group.endAt(now));
        return new TerminateGroupResult(groupId, GroupStatus.ENDED, now);
    }

    @Transactional
    public ReplaceRecurringScheduleResult replaceRecurringSchedule(
            Long memberId,
            Long groupId,
            ReplaceRecurringScheduleCommand command
    ) {
        Group group = groupCommandRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));
        GroupMember groupMember = groupMemberCommandRepository.findByGroupAndMember(group, member)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE);
        }
        if (group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "SESSION 그룹에는 반복 일정을 등록할 수 없습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, GROUP_ENDED_MESSAGE);
        }

        RecurringGroupSchedule schedule;
        try {
            schedule = RecurringGroupSchedule.of(command.daysOfWeek(), command.startTime(), command.endTime());
        } catch (BusinessException exception) {
            throw new BusinessException(ErrorCode.SCHEDULE_INVALID_RULE, exception.getMessage());
        }
        Group saved = groupCommandRepository.save(group.replaceRecurringSchedule(schedule));
        return new ReplaceRecurringScheduleResult(
                saved.getRecurringSchedule().getActivityDays().values(),
                saved.getRecurringSchedule().getStartTime(),
                saved.getRecurringSchedule().getEndTime()
        );
    }

    @Transactional
    public void removeRecurringSchedule(Long memberId, Long groupId) {
        Group group = groupCommandRepository.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));
        GroupMember groupMember = groupMemberCommandRepository.findByGroupAndMember(group, member)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, GROUP_ACCESS_DENIED_MESSAGE);
        }
        if (group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "SESSION 그룹에는 반복 일정이 없습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, GROUP_ENDED_MESSAGE);
        }
        groupCommandRepository.save(group.removeRecurringSchedule());
    }

    private Group createGroup(CreateGroupCommand command, LocalDateTime createdAt) {
        GroupType type = command.type();
        if (type == null) {
            throw new IllegalArgumentException("그룹 유형은 필수입니다.");
        }
        if (type == GroupType.SESSION) {
            validateSessionSchedule(command);
            return Group.createSession(
                    command.name(), command.introduction(), command.description(),
                    DEFAULT_REPRESENTATIVE_IMAGE_KEY, toSessionSchedule(command), createdAt
            );
        }
        validateRecurringSchedule(command);
        RecurringGroupSchedule schedule = toRecurringSchedule(command);
        if (type == GroupType.CLUB) {
            return Group.createClub(command.name(), command.introduction(), command.description(),
                    DEFAULT_REPRESENTATIVE_IMAGE_KEY, schedule, createdAt);
        }
        return Group.createStudy(command.name(), command.introduction(), command.description(),
                DEFAULT_REPRESENTATIVE_IMAGE_KEY, schedule, createdAt);
    }

    private void validateSessionSchedule(CreateGroupCommand command) {
        if (command.recurringSchedule() != null) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, SCHEDULE_TYPE_MISMATCH_MESSAGE);
        }
        if (command.sessionSchedule() == null) {
            throw new BusinessException(ErrorCode.SCHEDULE_REQUIRED, SCHEDULE_REQUIRED_MESSAGE);
        }
    }

    private void validateRecurringSchedule(CreateGroupCommand command) {
        if (command.sessionSchedule() != null) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, SCHEDULE_TYPE_MISMATCH_MESSAGE);
        }
        if (command.recurringSchedule() == null) {
            throw new BusinessException(ErrorCode.SCHEDULE_REQUIRED, "정기 일정이 필요합니다.");
        }
    }

    private RecurringGroupSchedule toRecurringSchedule(CreateGroupCommand command) {
        if (command.recurringSchedule() == null) {
            return null;
        }
        CreateGroupCommand.RecurringSchedule schedule = command.recurringSchedule();
        try {
            return RecurringGroupSchedule.of(schedule.daysOfWeek(), schedule.startTime(), schedule.endTime());
        } catch (BusinessException exception) {
            throw new BusinessException(ErrorCode.SCHEDULE_INVALID_RULE, SCHEDULE_INVALID_RULE_MESSAGE);
        }
    }

    private SessionGroupSchedule toSessionSchedule(CreateGroupCommand command) {
        CreateGroupCommand.SessionSchedule schedule = command.sessionSchedule();
        try {
            return SessionGroupSchedule.of(schedule.sessionDate(), schedule.startTime(), schedule.endTime());
        } catch (BusinessException exception) {
            throw new BusinessException(ErrorCode.SCHEDULE_INVALID_RULE, SCHEDULE_INVALID_RULE_MESSAGE);
        }
    }
}
