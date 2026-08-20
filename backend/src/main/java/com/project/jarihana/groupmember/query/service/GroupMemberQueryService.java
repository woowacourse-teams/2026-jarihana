package com.project.jarihana.groupmember.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupmember.query.repository.GroupMemberListRepository;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListPage;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListProjection;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListSearchCriteria;
import com.project.jarihana.groupmember.query.service.dto.GroupMemberListQuery;
import com.project.jarihana.groupmember.query.service.dto.GroupMemberListResult;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class GroupMemberQueryService {

    private static final int MAX_SIZE = 100;

    private final GroupMemberListRepository groupMemberListRepository;

    public GroupMemberQueryService(GroupMemberListRepository groupMemberListRepository) {
        this.groupMemberListRepository = groupMemberListRepository;
    }

    public GroupMemberListResult findGroupMembers(Long groupId, GroupMemberListQuery query) {
        validateRequest(groupId, query);
        Cursor cursor = decodeCursor(query.cursor());
        if (!groupMemberListRepository.existsGroupById(groupId)) {
            throw new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
        }

        GroupMemberListPage page = groupMemberListRepository.findPage(
                new GroupMemberListSearchCriteria(
                        groupId,
                        cursor == null ? null : cursor.joinedAt(),
                        cursor == null ? null : cursor.id()
                ),
                query.size()
        );
        List<GroupMemberListProjection> projections = page.items();
        String nextCursor = page.hasNext()
                ? encodeCursor(projections.get(projections.size() - 1))
                : null;
        return new GroupMemberListResult(
                projections.stream().map(GroupMemberQueryService::toResult).toList(),
                nextCursor,
                page.hasNext()
        );
    }

    private static GroupMemberListResult.Item toResult(GroupMemberListProjection projection) {
        return new GroupMemberListResult.Item(
                projection.groupMemberId(),
                projection.memberId(),
                projection.crewName(),
                projection.generation(),
                projection.course().name(),
                projection.role().name(),
                projection.joinedAt()
        );
    }

    private static void validateRequest(Long groupId, GroupMemberListQuery query) {
        if (groupId == null || groupId < 1 || query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
    }

    private static String encodeCursor(GroupMemberListProjection projection) {
        String value = projection.joinedAt() + "|" + projection.groupMemberId();
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] values = decoded.split("\\|", -1);
            if (values.length != 2) {
                throw invalidParameter();
            }
            long id = Long.parseLong(values[1]);
            if (id < 1) {
                throw invalidParameter();
            }
            return new Cursor(LocalDateTime.parse(values[0]), id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidParameter();
        }
    }

    private static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    private record Cursor(LocalDateTime joinedAt, long id) {
    }
}
