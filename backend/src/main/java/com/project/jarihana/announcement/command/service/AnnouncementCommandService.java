package com.project.jarihana.announcement.command.service;

import com.project.jarihana.announcement.command.repository.AnnouncementCommandRepository;
import com.project.jarihana.announcement.command.service.dto.CreateAnnouncementCommand;
import com.project.jarihana.announcement.command.service.dto.CreateAnnouncementResult;
import com.project.jarihana.announcement.domain.Announcement;
import com.project.jarihana.announcement.domain.event.AnnouncementCreatedEvent;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class AnnouncementCommandService {

    private static final String GROUP_NOT_FOUND_MESSAGE = "모임을 찾을 수 없습니다.";
    private static final String MEMBER_NOT_FOUND_MESSAGE = "회원 정보를 찾을 수 없습니다.";
    private static final String LEADER_ONLY_MESSAGE = "모임장만 공지를 등록할 수 있습니다.";

    private final AnnouncementCommandRepository announcements;
    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository groupMembers;
    private final MemberRepository members;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AnnouncementCommandService(AnnouncementCommandRepository announcements,
                                     GroupCommandRepository groups,
                                     GroupMemberCommandRepository groupMembers,
                                     MemberRepository members,
                                     ApplicationEventPublisher events,
                                     Clock clock) {
        this.announcements = announcements;
        this.groups = groups;
        this.groupMembers = groupMembers;
        this.members = members;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public CreateAnnouncementResult create(long memberId, long groupId, CreateAnnouncementCommand command) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 공지를 등록할 수 없습니다.");
        }

        GroupMember groupMember = groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, LEADER_ONLY_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, LEADER_ONLY_MESSAGE);
        }
        Member author = members.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));

        LocalDateTime now = LocalDateTime.now(clock);
        Announcement announcement = announcements.save(Announcement.create(
                group, author, command.title(), command.content(), command.scope(), now
        ));
        events.publishEvent(new AnnouncementCreatedEvent(announcement.getId(), groupId, memberId, now));
        return new CreateAnnouncementResult(announcement.getId());
    }
}
