package com.project.jarihana.announcement.command.service;

import com.project.jarihana.announcement.command.repository.AnnouncementCommandRepository;
import com.project.jarihana.announcement.command.service.dto.CreateAnnouncementCommand;
import com.project.jarihana.announcement.command.service.dto.CreateAnnouncementResult;
import com.project.jarihana.announcement.command.service.dto.ModifyAnnouncementCommand;
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
    private static final String MANAGER_ONLY_MESSAGE = "모임장 또는 작성자만 공지를 관리할 수 있습니다.";
    private static final String GROUP_ENDED_MESSAGE = "종료된 모임의 공지는 변경할 수 없습니다.";
    private static final String ANNOUNCEMENT_NOT_FOUND_MESSAGE = "공지를 찾을 수 없습니다.";

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
        Group group = findActiveGroupForLeader(memberId, groupId);
        Member author = members.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, MEMBER_NOT_FOUND_MESSAGE));

        LocalDateTime now = LocalDateTime.now(clock);
        Announcement announcement = announcements.save(Announcement.create(
                group, author, command.title(), command.content(), command.scope(), now
        ));
        events.publishEvent(new AnnouncementCreatedEvent(announcement.getId(), groupId, memberId, now));
        return new CreateAnnouncementResult(announcement.getId());
    }

    @Transactional
    public void modify(long memberId, long groupId, long announcementId, ModifyAnnouncementCommand command) {
        findActiveGroup(groupId);
        Announcement announcement = findActiveAnnouncement(groupId, announcementId);
        ensureManager(memberId, groupId, announcement);
        announcements.save(announcement.modify(command.title(), command.content(), command.scope()));
    }

    @Transactional
    public void delete(long memberId, long groupId, long announcementId) {
        findActiveGroup(groupId);
        Announcement announcement = findActiveAnnouncement(groupId, announcementId);
        ensureManager(memberId, groupId, announcement);
        announcements.save(announcement.deleteAt(LocalDateTime.now(clock)));
    }

    private Group findActiveGroupForLeader(long memberId, long groupId) {
        Group group = findActiveGroup(groupId);
        GroupMember groupMember = groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, LEADER_ONLY_MESSAGE));
        if (groupMember.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, LEADER_ONLY_MESSAGE);
        }
        return group;
    }

    private Group findActiveGroup(long groupId) {
        if (groupId < 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE));
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, GROUP_ENDED_MESSAGE);
        }
        return group;
    }

    private void ensureManager(long memberId, long groupId, Announcement announcement) {
        boolean isLeader = groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .map(groupMember -> groupMember.getRole() == GroupMemberRole.LEADER)
                .orElse(false);
        if (!isLeader && !announcement.getAuthor().getId().equals(memberId)) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, MANAGER_ONLY_MESSAGE);
        }
    }

    private Announcement findActiveAnnouncement(long groupId, long announcementId) {
        if (announcementId < 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
        return announcements.findActiveByIdAndGroupId(announcementId, groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ANNOUNCEMENT_NOT_FOUND, ANNOUNCEMENT_NOT_FOUND_MESSAGE));
    }
}
