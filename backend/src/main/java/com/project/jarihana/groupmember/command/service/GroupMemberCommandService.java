package com.project.jarihana.groupmember.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.command.service.dto.TransferLeaderCommand;
import com.project.jarihana.groupmember.command.service.dto.TransferLeaderResult;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupmember.domain.LeadershipTransfer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GroupMemberCommandService {

    private final GroupCommandRepository groupCommandRepository;
    private final GroupMemberCommandRepository groupMemberCommandRepository;

    @Transactional
    public TransferLeaderResult transferLeader(long memberId, long groupId, TransferLeaderCommand command) {
        Group group = groupCommandRepository.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        GroupMember currentLeader = groupMemberCommandRepository
                .findByGroup_IdAndMember_Id(groupId, memberId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.GROUP_ACCESS_DENIED,
                        "현재 모임장만 역할을 위임할 수 있습니다."
                ));
        if (currentLeader.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "현재 모임장만 역할을 위임할 수 있습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(
                    ErrorCode.LEADER_DELEGATION_NOT_ALLOWED_FOR_ENDED_GROUP,
                    "종료된 그룹에서는 모임장 역할을 위임할 수 없습니다."
            );
        }
        GroupMember successor = groupMemberCommandRepository
                .findByIdAndGroup_Id(command.groupMemberId(), groupId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.GROUP_MEMBER_NOT_FOUND,
                        "위임할 그룹 구성원을 찾을 수 없습니다."
                ));
        if (successor.getRole() != GroupMemberRole.MEMBER) {
            throw new BusinessException(
                    ErrorCode.GROUP_MEMBER_ALREADY_LEADER,
                    "이미 모임장인 구성원에게는 역할을 위임할 수 없습니다."
            );
        }

        LeadershipTransfer transfer = currentLeader.transferLeadershipTo(successor);
        groupMemberCommandRepository.save(transfer.getFormerLeader());
        groupMemberCommandRepository.save(transfer.getNewLeader());

        return new TransferLeaderResult(group.getId(), currentLeader.getId(), successor.getId());
    }
}
