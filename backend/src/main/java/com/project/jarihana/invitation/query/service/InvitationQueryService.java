package com.project.jarihana.invitation.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.invitation.domain.InvitationStatus;
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

    public InvitationCandidateResult findCandidates(long memberId, long groupId, InvitationCandidateQuery query) {
        requireMember(memberId);
        if (groupId <= 0 || query == null) throw invalid();
        validateSize(query.size());
        String keyword = query.keyword() == null ? "" : query.keyword().strip();
        if (keyword.length() < 2 || keyword.length() > 50) throw invalid();
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
                item.message(), item.createdAt(), item.expiresAt(), InvitationStatus.resolve(item.type(), item.revokedAt(),
                item.groupActive(), item.inviterPresent(), item.expiresAt(), item.accepted(), now), false)).toList(), next, page.hasNext());
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
