package com.project.jarihana.groupspace.query.service;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.groupspace.query.repository.GroupSpaceQueryRepository;
import com.project.jarihana.groupspace.query.service.dto.GroupSpaceResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service
@RequiredArgsConstructor
public class GroupSpaceQueryService {
    private final GroupSpaceQueryRepository spaces;
    private final ObjectMapper mapper;
    private final LoginMemberReader loginMemberReader;

    public GroupSpaceResult findGroupSpace(long groupId) {
        var space = spaces.findSpace(groupId, loginMemberReader.currentMemberId().orElse(null))
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        if (space.type() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.GROUP_SPACE_NOT_AVAILABLE, "같이해요 모임에는 아지트가 없습니다.");
        }
        JsonNode room = space.roomJson() == null ? null : mapper.readTree(space.roomJson());
        if (space.role() == null && room instanceof ObjectNode document) {
            document.put("notice", "");
            document.put("coverPhoto", "");
            for (JsonNode item : document.path("items")) {
                ObjectNode asset = (ObjectNode) item;
                for (String field : new String[]{"title", "note", "photo", "link"}) {
                    if (asset.has(field)) {
                        asset.put(field, "");
                    }
                }
            }
        }
        return new GroupSpaceResult(room,
                space.revision() == null ? 0 : space.revision(),
                space.role() == GroupMemberRole.LEADER && space.status() == GroupStatus.ACTIVE, space.updatedAt());
    }
}
