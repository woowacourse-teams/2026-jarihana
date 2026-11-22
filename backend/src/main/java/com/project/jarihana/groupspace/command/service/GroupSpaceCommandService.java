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
import com.project.jarihana.groupspace.domain.BlueprintRef;
import com.project.jarihana.groupspace.domain.FurnitureType;
import com.project.jarihana.groupspace.domain.GroupSpace;
import com.project.jarihana.groupspace.domain.RoomDocumentValidator;
import com.project.jarihana.groupspace.domain.SpaceBlueprint;
import com.project.jarihana.groupspace.query.repository.FurnitureCatalogRepository;
import com.project.jarihana.groupspace.query.repository.SpaceBlueprintRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service
@RequiredArgsConstructor
public class GroupSpaceCommandService {
    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository members;
    private final GroupSpaceCommandRepository spaces;
    private final SpaceBlueprintRepository blueprints;
    private final FurnitureCatalogRepository furniture;
    private final RoomDocumentValidator validator;
    private final Clock clock;

    @Transactional(propagation = Propagation.MANDATORY)
    public void initializeForNewGroup(Group group, String templateKey, LocalDateTime now) {
        if (group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "같이해요 모임에는 아지트를 선택할 수 없습니다.");
        }
        SpaceBlueprint blueprint = blueprints.getDefault(templateKey);
        ObjectNode room = (ObjectNode) blueprint.defaultRoom();
        room.put("name", roomName(group.getName()));
        List<FurnitureType> catalog = furniture.findAll();
        retainPlaceableItems(room, catalog);
        String roomJson = validator.validateAndSerialize(room, null, catalog);
        validateLevels(room, blueprint);
        spaces.saveAndFlush(GroupSpace.create(group, roomJson, blueprint.ref(), now));
    }

    private static String roomName(String groupName) {
        String name = groupName.strip();
        int end = Math.min(name.length(), RoomDocumentValidator.MAX_NAME_LENGTH);
        if (end < name.length() && Character.isSurrogatePair(name.charAt(end - 1), name.charAt(end))) {
            end--;
        }
        return name.substring(0, end);
    }

    private static void retainPlaceableItems(ObjectNode room, List<FurnitureType> catalog) {
        int version = room.path("version").asInt();
        Set<String> kinds = catalog.stream()
                .filter(type -> type.placeable() && version >= type.minRoomVersion())
                .map(FurnitureType::kind)
                .collect(Collectors.toSet());
        List<JsonNode> available = room.path("items").valueStream()
                .filter(item -> kinds.contains(item.path("kind").asString()))
                .toList();
        Set<String> ids = available.stream().map(item -> item.path("id").asString()).collect(Collectors.toSet());
        var items = room.putArray("items");
        for (JsonNode item : available) {
            if (!item.has("parentId") || ids.contains(item.path("parentId").asString())) {
                items.add(item);
            }
        }
    }

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
        GroupSpace current = spaces.findByGroupId(groupId).orElse(null);
        long revision = current == null ? 0 : current.getRevision();
        if (command.expectedRevision() != revision) {
            throw new BusinessException(ErrorCode.GROUP_SPACE_CONFLICT, "다른 곳에서 공간이 변경되었습니다. 최신 공간을 불러온 뒤 다시 저장해 주세요.");
        }
        JsonNode previousRoom = current == null ? null : validator.readRoom(current.getRoomJson());
        String roomJson = validator.validateAndSerialize(command.room(), previousRoom, furniture.findAll());
        var blueprint = selectBlueprint(current, previousRoom, command);
        validateLevels(command.room(), blueprint);
        GroupSpace saved = spaces.saveAndFlush(current == null
                ? GroupSpace.create(group, roomJson, blueprint.ref(), LocalDateTime.now(clock))
                : current.replaceRoom(roomJson, blueprint.ref()));
        return new SaveGroupSpaceResult(command.room(), saved.getRevision(), true, saved.getUpdatedAt(),
                blueprint.ref(), blueprint.geometry(), blueprint.spawn());
    }

    private static void validateLevels(JsonNode room, SpaceBlueprint blueprint) {
        if (!blueprint.geometry().hasNonNull("mezzanine")) {
            for (var item : room.path("items")) {
                if (item.path("level").asInt(0) == 1) {
                    throw new BusinessException(ErrorCode.INVALID_PARAMETER, "단층 도면에 2층 가구를 배치할 수 없습니다.");
                }
            }
        }
    }

    private SpaceBlueprint selectBlueprint(GroupSpace current, JsonNode previousRoom, SaveGroupSpaceCommand command) {
        var historical = BlueprintRef.historical(command.room());
        var requested = command.blueprintRef();
        if (requested != null && !historical.templateKey().equals(requested.templateKey())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "방 문서와 도면의 테마가 일치해야 합니다.");
        }
        if (command.replaceLayout() && requested == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "전체 배치를 교체하려면 선택한 도면이 필요합니다.");
        }
        if (requested != null && (current == null || command.replaceLayout())) {
            var selected = blueprints.getDefault(historical.templateKey());
            if (!selected.ref().equals(requested)) {
                throw new BusinessException(ErrorCode.GROUP_SPACE_CONFLICT, "기본 도면이 변경되었습니다. 다시 선택해 주세요.");
            }
            requireCurrentDocument(historical);
            return selected;
        }
        if (current == null) return blueprints.get(historical);

        var previous = BlueprintRef.historical(previousRoom);
        if (requested == null) {
            if (!current.blueprintRef().equals(previous)) {
                throw new BusinessException(ErrorCode.GROUP_SPACE_CONFLICT, "현재 도면을 지원하는 편집기로 다시 열어 주세요.");
            }
            return blueprints.get(historical);
        }
        if (!current.blueprintRef().equals(requested)) {
            throw new BusinessException(ErrorCode.GROUP_SPACE_CONFLICT, "저장한 방의 도면을 변경할 수 없습니다.");
        }
        if (!historical.equals(previous)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "배치를 편집할 때 방 문서 버전을 유지해 주세요.");
        }
        return blueprints.get(requested);
    }

    private static void requireCurrentDocument(BlueprintRef historical) {
        int version = historical.templateKey().equals("lounge") ? 12 : 11;
        if (historical.version() != version) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "현재 편집기에서 방을 다시 만들어 주세요.");
        }
    }
}
