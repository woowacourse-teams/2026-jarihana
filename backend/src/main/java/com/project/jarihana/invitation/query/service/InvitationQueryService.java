package com.project.jarihana.invitation.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.invitation.command.service.InvitationTokenCodec;
import com.project.jarihana.invitation.domain.InvitationStatus;
import com.project.jarihana.invitation.domain.InvitationType;
import com.project.jarihana.invitation.query.repository.dto.InvitationDetailProjection;
import com.project.jarihana.invitation.query.service.dto.InvitationDetailResult;
import com.project.jarihana.invitation.query.service.dto.IssuedInvitationQuery;
import com.project.jarihana.invitation.query.service.dto.IssuedInvitationResult;
import com.project.jarihana.invitation.query.repository.InvitationCandidateRepository;
import com.project.jarihana.invitation.query.repository.InvitationQueryRepository;
import com.project.jarihana.invitation.query.service.dto.InvitationCandidateQuery;
import com.project.jarihana.invitation.query.service.dto.InvitationCandidateResult;
import com.project.jarihana.invitation.query.service.dto.ReceivedInvitationQuery;
import com.project.jarihana.invitation.query.service.dto.ReceivedInvitationResult;
import com.project.jarihana.member.command.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class InvitationQueryService {
    private final InvitationCandidateRepository candidates;
    private final InvitationQueryRepository invitations;
    private final MemberRepository members;
    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository groupMembers;
    private final Clock clock;
    private final InvitationTokenCodec tokens;

    public IssuedInvitationResult findIssued(long memberId, long groupId, IssuedInvitationQuery query) {
        requireMember(memberId);
        if (groupId <= 0 || query == null || query.scope() == null) throw invalid();
        validateSize(query.size());
        groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        var membership = groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "현재 구성원만 발급 목록을 조회할 수 있습니다."));
        boolean managed = query.scope() == InvitationListScope.MANAGED_LINKS;
        String scope = "i:" + groupId + ":" + memberId + ":" + query.scope();
        InvitationCursor cursor = InvitationCursor.decode(query.cursor(), scope);
        var page = invitations.findIssued(groupId, memberId, managed, cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(), PageRequest.of(0, query.size()));
        var items = page.getContent();
        String next = page.hasNext() ? InvitationCursor.encode(scope, items.getLast().createdAt(), items.getLast().id()) : null;
        LocalDateTime now = LocalDateTime.now(clock);
        return new IssuedInvitationResult(items.stream().map(item -> {
            InvitationStatus status = InvitationStatus.resolve(item.type(), item.revokedAt(), item.groupActive(),
                    item.inviterPresent(), item.expiresAt(), item.accepted(), now, item.state());
            return new IssuedInvitationResult.Item(item.id(), item.type(), item.groupId(), item.groupName(),
                    item.inviterId(), item.inviterCrewName(), item.createdAt(), item.expiresAt(), status, item.groupActive() && status != InvitationStatus.CANCELED
                    && (item.inviterId() == memberId || (item.type() == InvitationType.LINK && membership.getRole() == GroupMemberRole.LEADER)));
        }).toList(), next, page.hasNext());
    }

    public InvitationDetailResult findDetail(long memberId, long invitationId) {
        requireMember(memberId);
        if (invitationId <= 0) throw invalid();
        InvitationDetailProjection item = invitations.findDetail(invitationId, memberId).orElseThrow(InvitationQueryService::notFound);
        boolean owner = item.inviterId() == memberId;
        boolean target = item.targetId() != null && item.targetId() == memberId;
        if (item.type() == InvitationType.DIRECT && !owner && !target) {
            throw new BusinessException(ErrorCode.INVITATION_ACCESS_DENIED, "초대 상세에 접근할 수 없습니다.");
        }
        if (item.type() == InvitationType.LINK && !owner && !item.viewerPresent()) throw notFound();
        InvitationStatus status = status(item);
        boolean canRevoke = item.viewerPresent() && item.groupActive() && status != InvitationStatus.CANCELED
                && (owner || (item.type() == InvitationType.LINK && item.viewerLeader()));
        boolean canAccept = status == InvitationStatus.VALID && !item.viewerPresent()
                && (item.type() == InvitationType.LINK || target);
        String path = item.type() == InvitationType.DIRECT ? "/invitations/" + item.id()
                : item.viewerPresent() ? "/invitations/link/" + tokens.recover(item.encryptedToken(), item.tokenHash()) : null;
        return detail(item, status, canAccept, canRevoke, path);
    }

    public InvitationDetailResult previewLink(String token) {
        long id = invitations.findLinkIdByTokenHash(tokens.hash(token)).orElseThrow(InvitationQueryService::notFound);
        InvitationDetailProjection item = invitations.findDetail(id, 0).orElseThrow(InvitationQueryService::notFound);
        InvitationStatus status = status(item);
        return detail(item, status, status == InvitationStatus.VALID, false, null);
    }

    private InvitationStatus status(InvitationDetailProjection item) {
        return InvitationStatus.resolve(item.type(), item.revokedAt(), item.groupActive(), item.inviterPresent(),
                item.expiresAt(), item.accepted(), LocalDateTime.now(clock), item.state());
    }

    private InvitationDetailResult detail(InvitationDetailProjection item, InvitationStatus status,
            boolean canAccept, boolean canRevoke, String path) {
        return new InvitationDetailResult(item.id(), item.type(), item.groupId(), item.groupName(), item.groupIntroduction(),
                item.inviterId(), item.inviterCrewName(), item.createdAt(), item.expiresAt(),
                status, canAccept, canRevoke, path);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.INVITATION_NOT_FOUND, "초대를 찾을 수 없습니다.");
    }

    public InvitationCandidateResult findCandidates(long memberId, long groupId, InvitationCandidateQuery query) {
        requireMember(memberId);
        if (groupId <= 0 || query == null) throw invalid();
        validateSize(query.size());
        String keyword = query.keyword() == null ? "" : query.keyword().strip();
        if ((!keyword.isEmpty() && keyword.length() < 2) || keyword.length() > 50) throw invalid();
        Group group = groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        groupMembers.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "현재 구성원만 회원 후보를 조회할 수 있습니다."));
        if (!group.isActive()) throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임에는 초대할 수 없습니다.");
        String scope = "c:" + groupId + ":" + memberId + ":" + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(keyword.getBytes(StandardCharsets.UTF_8));
        InvitationCursor cursor = InvitationCursor.decode(query.cursor(), scope);
        var page = candidates.findCandidates(groupId, memberId, keyword, cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(), PageRequest.of(0, query.size()));
        var items = page.getContent();
        String next = page.hasNext() ? InvitationCursor.encode(scope, items.getLast().createdAt(), items.getLast().memberId()) : null;
        return new InvitationCandidateResult(items.stream().map(item -> new InvitationCandidateResult.Item(
                item.memberId(), item.crewName(), item.generation(), item.memberType(), item.course())).toList(), next, page.hasNext());
    }

    public ReceivedInvitationResult findReceived(long memberId, ReceivedInvitationQuery query) {
        requireMember(memberId);
        if (query == null) throw invalid();
        validateSize(query.size());
        String scope = "r:" + memberId;
        InvitationCursor cursor = InvitationCursor.decode(query.cursor(), scope);
        var page = invitations.findReceived(memberId, cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(), PageRequest.of(0, query.size()));
        var items = page.getContent();
        String next = page.hasNext() ? InvitationCursor.encode(scope, items.getLast().createdAt(), items.getLast().id()) : null;
        LocalDateTime now = LocalDateTime.now(clock);
        return new ReceivedInvitationResult(items.stream().map(item -> new ReceivedInvitationResult.Item(
                item.id(), item.type(), item.groupId(), item.groupName(), item.inviterId(), item.inviterCrewName(),
                item.createdAt(), item.expiresAt(), InvitationStatus.resolve(item.type(), item.revokedAt(),
                item.groupActive(), item.inviterPresent(), item.expiresAt(), item.accepted(), now, item.state()), false)).toList(), next, page.hasNext());
    }

    private void requireMember(long id) {
        members.findById(id).filter(member -> member.getWithdrawnAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
    }

    private static void validateSize(int size) {
        if (size < 1 || size > 100) throw invalid();
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }
}
