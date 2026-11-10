package com.project.jarihana.groupspace.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupspace.command.repository.GroupSpaceCommandRepository;
import com.project.jarihana.groupspace.command.service.dto.SaveGroupSpaceCommand;
import com.project.jarihana.groupspace.command.service.dto.SaveGroupSpaceResult;
import com.project.jarihana.groupspace.domain.GroupSpace;
import com.project.jarihana.groupspace.domain.RoomDocumentValidator;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GroupSpaceCommandService {
    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository members;
    private final GroupSpaceCommandRepository spaces;
    private final RoomDocumentValidator validator;
    private final Clock clock;

    @Transactional
    public SaveGroupSpaceResult saveGroupSpace(long memberId, long groupId, SaveGroupSpaceCommand command) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        if (group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.GROUP_SPACE_NOT_AVAILABLE, "같이해요 모임에는 아지트가 없습니다.");
        }
        var membership = members.findByGroupIdAndMemberId(groupId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임장만 공간을 저장할 수 있습니다."));
        if (membership.getRole() != GroupMemberRole.LEADER) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "모임장만 공간을 저장할 수 있습니다.");
        }
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 모임의 공간은 변경할 수 없습니다.");
        }
        String roomJson = validator.validateAndSerialize(command.room());
        GroupSpace current = spaces.findByGroupId(groupId).orElse(null);
        long revision = current == null ? 0 : current.getRevision();
        if (command.expectedRevision() != revision) {
            throw new BusinessException(ErrorCode.GROUP_SPACE_CONFLICT, "다른 곳에서 공간이 변경되었습니다. 최신 공간을 불러온 뒤 다시 저장해 주세요.");
        }
        GroupSpace saved = spaces.saveAndFlush(current == null
                ? GroupSpace.create(group, roomJson, LocalDateTime.now(clock)) : current.replaceRoom(roomJson));
        return new SaveGroupSpaceResult(command.room(), saved.getRevision(), true, saved.getUpdatedAt());
    }
}
