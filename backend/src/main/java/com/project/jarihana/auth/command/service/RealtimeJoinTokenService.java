package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.token.IssuedRealtimeJoinToken;
import com.project.jarihana.auth.token.RealtimeJoinTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.groupspace.domain.RealtimeSpacePolicy;
import com.project.jarihana.member.command.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RealtimeJoinTokenService {
    private final GroupCommandRepository groups;
    private final MemberRepository members;
    private final RealtimeJoinTokenProvider tokens;

    public IssuedRealtimeJoinToken issueJoinToken(long memberId, long groupId) {
        var member = members.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "아지트에 입장할 수 없습니다."));
        RealtimeSpacePolicy.requireCurrentMember(member.getWithdrawnAt());
        var group = groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        RealtimeSpacePolicy.requireOpen(group.getType(), group.getStatus());
        return tokens.issue(memberId, groupId);
    }
}
