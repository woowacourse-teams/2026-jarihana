package com.project.jarihana.invitation.command.service;

import com.project.jarihana.chat.domain.ChatLifecycleEvent;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.transaction.ConcurrentCommandExecutor;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.invitation.command.service.dto.RevokeInvitationResult;
import com.project.jarihana.notification.command.repository.NotificationCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.invitation.command.repository.InvitationAcceptanceCommandRepository;
import com.project.jarihana.invitation.command.repository.InvitationCommandRepository;
import com.project.jarihana.invitation.command.service.dto.CreateInvitationCommand;
import com.project.jarihana.invitation.command.service.dto.AcceptInvitationCommand;
import com.project.jarihana.invitation.command.service.dto.AcceptInvitationResult;
import com.project.jarihana.invitation.domain.InvitationAcceptance;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.RegistrationStatus;
import com.project.jarihana.invitation.command.service.dto.CreateInvitationResult;
import com.project.jarihana.invitation.domain.Invitation;
import com.project.jarihana.invitation.domain.InvitationStatus;
import com.project.jarihana.invitation.domain.InvitationType;
import com.project.jarihana.invitation.domain.InvitationState;
import com.project.jarihana.invitation.domain.event.InvitationIssuedEvent;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class InvitationCommandService {
    private final InvitationCommandRepository invitations;
    private final InvitationAcceptanceCommandRepository acceptances;
    private final MemberRepository members;
    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository groupMembers;
    private final InvitationTokenCodec tokens;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final NotificationCommandRepository notifications;
    private final NotificationDeliveryCommandRepository deliveries;
    private final RegistrationCommandRepository registrations;
    private final ConcurrentCommandExecutor concurrentCommands;

    public AcceptInvitationResult acceptInvitation(long memberId, long invitationId, AcceptInvitationCommand command) {
        try {
            return concurrentCommands.execute(() -> acceptInvitationInTransaction(memberId, invitationId, command));
        } catch (DataIntegrityViolationException failure) {
            if (invitations.findById(invitationId).isEmpty()) throw notFound();
            throw failure;
        }
    }

    @Transactional
    public void removeGroupInvitations(long groupId) {
        deliveries.cancelInvitationsByGroupId(groupId, LocalDateTime.now(clock));
        acceptances.removeAllByGroupId(groupId);
        invitations.removeAllByGroupId(groupId);
    }

    private AcceptInvitationResult acceptInvitationInTransaction(long memberId, long invitationId, AcceptInvitationCommand command) {
        if (invitationId <= 0 || command == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초대 수락 요청이 올바르지 않습니다.");
        }
        Member member = members.findById(memberId).filter(value -> value.getWithdrawnAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
        long groupId = invitations.findGroupIdById(invitationId).orElseThrow(InvitationCommandService::notFound);
        Group group = groups.findWithOptimisticLockById(groupId).orElseThrow(InvitationCommandService::notFound);
        Invitation invitation = invitations.findDirectWithOptimisticLockById(invitationId).orElseGet(() ->
                invitations.findWithOptimisticLockById(invitationId).orElseThrow(InvitationCommandService::notFound));
        if (invitation.getType() == InvitationType.DIRECT) {
            if (invitation.getTargetMember().getId() != memberId) {
                throw new BusinessException(ErrorCode.INVITATION_ACCESS_DENIED, "지정된 회원만 초대를 수락할 수 있습니다.");
            }
            if (command.token() != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "지정 초대에는 공유 토큰을 전달하지 않습니다.");
            }
        } else if (command.token() == null || !Objects.equals(tokens.hash(command.token()), invitation.getTokenHash())) {
            throw notFound();
        }
        if (invitation.getState() == InvitationState.REJECTED) {
            throw new BusinessException(ErrorCode.INVITATION_REJECTED, "거절한 초대장입니다.");
        }
        var existing = groupMembers.findByGroupIdAndMemberId(groupId, memberId);
        if (existing.isPresent()) {
            var membership = existing.orElseThrow();
            return new AcceptInvitationResult(false, invitationId, groupId, membership.getId(), membership.getJoinedAt());
        }
        LocalDateTime now = LocalDateTime.now(clock);
        boolean inviterPresent = invitation.getInviterMember().getWithdrawnAt() == null
                && groupMembers.findByGroupIdAndMemberId(groupId, invitation.getInviterMember().getId()).isPresent();
        InvitationStatus status = InvitationStatus.resolve(invitation.getType(), invitation.getRevokedAt(), group.isActive(),
                inviterPresent, invitation.getExpiresAt(), false, now, invitation.getState());
        switch (status) {
            case CANCELED -> throw new BusinessException(ErrorCode.INVITATION_CANCELED, "취소된 초대입니다.");
            case GROUP_ENDED -> throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 합류할 수 없습니다.");
            case EXPIRED -> throw new BusinessException(ErrorCode.INVITATION_EXPIRED, "만료된 초대입니다.");
            case ACCEPTED -> throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 수락한 초대입니다.");
            case REJECTED -> throw new BusinessException(ErrorCode.INVITATION_REJECTED, "거절한 초대장입니다.");
            case VALID -> { }
        }
        approvePendingRegistrations(groupId, memberId, now);
        registrations.flush();
        GroupMember membership = groupMembers.save(GroupMember.createMember(group, member, now));
        events.publishEvent(new ChatLifecycleEvent(ChatLifecycleEvent.Type.JOINED, groupId, memberId));
        approvePendingRegistrations(groupId, memberId, now);
        acceptances.save(InvitationAcceptance.create(invitation, member, now));
        return new AcceptInvitationResult(true, invitationId, groupId, membership.getId(), membership.getJoinedAt());
    }

    private void approvePendingRegistrations(long groupId, long memberId, LocalDateTime now) {
        for (var pending : registrations.findAllByRecruitmentGroupIdAndMemberIdAndStatusOrderByIdAsc(
                groupId, memberId, RegistrationStatus.PENDING)) {
            registrations.save(pending.approveByInvitation(now));
        }
    }

    public void declineInvitation(long memberId, long invitationId) {
        concurrentCommands.execute(() -> {
            if (invitationId <= 0) throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초대 식별자는 양수여야 합니다.");
            members.findById(memberId).filter(member -> member.getWithdrawnAt() == null)
                    .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
            long groupId = invitations.findGroupIdById(invitationId).orElseThrow(InvitationCommandService::notFound);
            Group group = groups.findWithOptimisticLockById(groupId).orElseThrow(InvitationCommandService::notFound);
            Invitation invitation = invitations.findWithOptimisticLockById(invitationId).orElseThrow(InvitationCommandService::notFound);
            if (invitation.getType() != InvitationType.DIRECT || invitation.getTargetMember().getId() != memberId) {
                throw new BusinessException(ErrorCode.INVITATION_ACCESS_DENIED, "지정된 회원만 초대를 거절할 수 있습니다.");
            }
            if (invitation.getState() == InvitationState.REJECTED) return null;
            if (acceptances.findByInvitationIdAndMemberId(invitationId, memberId).isPresent()) {
                throw new BusinessException(ErrorCode.INVITATION_ALREADY_ACCEPTED, "이미 수락한 초대는 거절할 수 없습니다.");
            }
            LocalDateTime now = LocalDateTime.now(clock);
            boolean inviterPresent = invitation.getInviterMember().getWithdrawnAt() == null
                    && groupMembers.findByGroupIdAndMemberId(groupId, invitation.getInviterMember().getId()).isPresent();
            InvitationStatus status = InvitationStatus.resolve(invitation.getType(), invitation.getRevokedAt(), group.isActive(),
                    inviterPresent, invitation.getExpiresAt(), false, now, invitation.getState());
            switch (status) {
                case CANCELED -> throw new BusinessException(ErrorCode.INVITATION_CANCELED, "취소된 초대입니다.");
                case GROUP_ENDED -> throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임의 초대는 거절할 수 없습니다.");
                case EXPIRED -> throw new BusinessException(ErrorCode.INVITATION_EXPIRED, "만료된 초대입니다.");
                case ACCEPTED, REJECTED, VALID -> { }
            }
            invitations.save(invitation.decline(now));
            notifications.findByEventKeyAndMemberId("invitation:" + invitationId + ":received", memberId)
                    .ifPresent(notification -> deliveries.cancelByNotificationId(notification.getId(), now));
            return null;
        });
    }

    public RevokeInvitationResult revokeInvitation(long memberId, long invitationId) {
        return concurrentCommands.execute(() -> revokeInvitationInTransaction(memberId, invitationId));
    }

    private RevokeInvitationResult revokeInvitationInTransaction(long memberId, long invitationId) {
        if (invitationId <= 0) throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초대 식별자는 양수여야 합니다.");
        members.findById(memberId).filter(member -> member.getWithdrawnAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
        long groupId = invitations.findGroupIdById(invitationId).orElseThrow(InvitationCommandService::notFound);
        Group group = groups.findWithLockById(groupId).orElseThrow(InvitationCommandService::notFound);
        Invitation invitation = invitations.findById(invitationId).orElseThrow(InvitationCommandService::notFound);
        var membership = groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "초대를 취소할 수 없습니다."));
        boolean owner = invitation.getInviterMember().getId() == memberId;
        boolean linkLeader = invitation.getType() == InvitationType.LINK && membership.getRole() == GroupMemberRole.LEADER;
        if (!owner && !linkLeader) throw new BusinessException(ErrorCode.ACCESS_DENIED, "초대를 취소할 수 없습니다.");
        if (!group.isActive()) throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임의 초대는 취소할 수 없습니다.");
        LocalDateTime now = LocalDateTime.now(clock);
        Invitation revoked = invitation.revoke(now);
        if (invitation.getRevokedAt() == null) invitations.save(revoked);
        if (invitation.getType() == InvitationType.DIRECT) {
            notifications.findByEventKeyAndMemberId("invitation:" + invitationId + ":received", invitation.getTargetMember().getId())
                    .ifPresent(notification -> deliveries.cancelByNotificationId(notification.getId(), now));
        }
        return new RevokeInvitationResult(invitationId, revoked.getRevokedAt(), InvitationStatus.CANCELED);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.INVITATION_NOT_FOUND, "초대를 찾을 수 없습니다.");
    }

    @Transactional
    public CreateInvitationResult createInvitation(long memberId, long groupId, CreateInvitationCommand command) {
        validate(groupId, command);
        Member inviter = members.findById(memberId).filter(member -> member.getWithdrawnAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "현재 구성원만 초대를 발급할 수 있습니다."));
        if (!group.isActive()) throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 초대할 수 없습니다.");
        LocalDateTime now = LocalDateTime.now(clock);
        var existing = invitations.findByInviterMemberIdAndRequestId(memberId, command.requestId());
        if (existing.isPresent()) return reused(existing.get(), command, groupId, now);

        Invitation issued;
        if (command.type() == InvitationType.DIRECT) {
            Member target = members.findById(command.targetMemberId()).filter(member -> member.getWithdrawnAt() == null)
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_PARAMETER, "가입 완료한 초대 대상을 지정해야 합니다."));
            if (inviter.equals(target)) throw new BusinessException(ErrorCode.INVALID_PARAMETER, "자신을 초대할 수 없습니다.");
            if (groupMembers.findByGroupIdAndMemberId(groupId, target.getId()).isPresent()) {
                throw new BusinessException(ErrorCode.GROUP_MEMBER_ALREADY_EXISTS, "이미 모임에 참여 중인 회원입니다.");
            }
            issued = Invitation.issueDirect(group, inviter, target, command.requestId(), now);
        } else {
            var shared = invitations.findValidSharedLink(groupId, now);
            if (shared.isPresent()) return result(shared.orElseThrow(), true, now);
            var token = tokens.issue();
            issued = Invitation.issueLink(group, inviter, command.requestId(), token.hash(), token.encrypted(), now);
        }
        int inserted = invitations.insertIfAbsent(groupId, memberId, command.targetMemberId(), issued.getType().name(),
                issued.getRequestId(), issued.getTokenHash(), issued.getEncryptedToken(), issued.getExpiresAt(), now);
        Invitation stored = invitations.findByInviterMemberIdAndRequestId(memberId, command.requestId()).orElseThrow();
        if (inserted == 0) return reused(stored, command, groupId, now);
        if (stored.getType() == InvitationType.DIRECT) {
            events.publishEvent(new InvitationIssuedEvent(stored.getId(), groupId, stored.getTargetMember().getId(), now));
        }
        return result(stored, false, now);
    }

    private CreateInvitationResult reused(Invitation existing, CreateInvitationCommand command, long groupId, LocalDateTime now) {
        Long targetId = existing.getTargetMember() == null ? null : existing.getTargetMember().getId();
        if (existing.getGroup().getId() != groupId || existing.getType() != command.type()
                || !Objects.equals(targetId, command.targetMemberId())) {
            throw new BusinessException(ErrorCode.INVITATION_REQUEST_CONFLICT, "같은 발급 요청 식별자에 다른 내용을 사용할 수 없습니다.");
        }
        return result(existing, true, now);
    }

    private CreateInvitationResult result(Invitation invitation, boolean reused, LocalDateTime now) {
        Group group = invitation.getGroup();
        Long targetId = invitation.getTargetMember() == null ? null : invitation.getTargetMember().getId();
        boolean accepted = targetId != null && acceptances.findByInvitationIdAndMemberId(invitation.getId(), targetId).isPresent();
        boolean inviterPresent = invitation.getInviterMember().getWithdrawnAt() == null
                && groupMembers.findByGroupIdAndMemberId(group.getId(), invitation.getInviterMember().getId()).isPresent();
        InvitationStatus status = InvitationStatus.resolve(invitation.getType(), invitation.getRevokedAt(), group.isActive(),
                inviterPresent, invitation.getExpiresAt(), accepted, now, invitation.getState());
        String path = invitation.getType() == InvitationType.DIRECT ? "/invitations/" + invitation.getId()
                : "/invitations/link/" + tokens.recover(invitation.getEncryptedToken(), invitation.getTokenHash());
        return new CreateInvitationResult(invitation.getId(), group.getId(), invitation.getType(), targetId,
                invitation.getCreatedAt(), invitation.getExpiresAt(), status, path, reused);
    }

    private void validate(long groupId, CreateInvitationCommand command) {
        if (groupId <= 0 || command == null || command.type() == null || command.requestId() == null
                || (command.type() == InvitationType.DIRECT && (command.targetMemberId() == null || command.targetMemberId() <= 0))
                || (command.type() == InvitationType.LINK && command.targetMemberId() != null)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "초대 발급 요청이 올바르지 않습니다.");
        }
    }
}
