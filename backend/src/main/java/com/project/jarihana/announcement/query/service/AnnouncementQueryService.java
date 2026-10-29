package com.project.jarihana.announcement.query.service;

import com.project.jarihana.announcement.query.repository.AnnouncementQueryRepository;
import com.project.jarihana.announcement.query.repository.dto.AnnouncementDetailProjection;
import com.project.jarihana.announcement.query.repository.dto.AnnouncementSummaryProjection;
import com.project.jarihana.announcement.query.service.dto.AnnouncementDetailResult;
import com.project.jarihana.announcement.query.service.dto.AnnouncementListQuery;
import com.project.jarihana.announcement.query.service.dto.AnnouncementListResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.groupmember.query.repository.GroupMemberAccessRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;

@Service
public class AnnouncementQueryService {

    private static final int MAX_SIZE = 100;
    private static final String GROUP_NOT_FOUND_MESSAGE = "모임을 찾을 수 없습니다.";
    private static final String ANNOUNCEMENT_NOT_FOUND_MESSAGE = "공지를 찾을 수 없습니다.";

    private final AnnouncementQueryRepository announcements;
    private final GroupJpaRepository groups;
    private final GroupMemberAccessRepository groupMembers;

    public AnnouncementQueryService(AnnouncementQueryRepository announcements,
                                    GroupJpaRepository groups,
                                    GroupMemberAccessRepository groupMembers) {
        this.announcements = announcements;
        this.groups = groups;
        this.groupMembers = groupMembers;
    }

    @Transactional(readOnly = true)
    public AnnouncementListResult findByGroup(long groupId, AnnouncementListQuery query, Long memberId) {
        validateQuery(groupId, query);
        if (!groups.existsById(groupId)) {
            throw new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE);
        }
        boolean groupMember = memberId != null && groupMembers.existsByGroupIdAndMemberId(groupId, memberId);
        Cursor cursor = decodeCursor(query.cursor());
        List<AnnouncementSummaryProjection> candidates = announcements.findPage(
                groupId,
                groupMember,
                cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(),
                Pageable.ofSize(query.size() + 1)
        );
        boolean hasNext = candidates.size() > query.size();
        List<AnnouncementSummaryProjection> page = hasNext
                ? candidates.subList(0, query.size())
                : candidates;
        String nextCursor = hasNext ? encodeCursor(page.get(page.size() - 1)) : null;
        return new AnnouncementListResult(page.stream().map(AnnouncementQueryService::toItem).toList(), nextCursor, hasNext);
    }

    @Transactional(readOnly = true)
    public AnnouncementDetailResult findDetail(long groupId, long announcementId, Long memberId) {
        if (groupId < 1 || announcementId < 1) {
            throw invalidParameter();
        }
        if (!groups.existsById(groupId)) {
            throw new BusinessException(ErrorCode.GROUP_NOT_FOUND, GROUP_NOT_FOUND_MESSAGE);
        }
        boolean groupMember = memberId != null && groupMembers.existsByGroupIdAndMemberId(groupId, memberId);
        AnnouncementDetailProjection item = announcements.findVisibleByIdAndGroupId(
                announcementId, groupId, groupMember
        ).orElseThrow(() -> new BusinessException(
                ErrorCode.ANNOUNCEMENT_NOT_FOUND, ANNOUNCEMENT_NOT_FOUND_MESSAGE
        ));
        return new AnnouncementDetailResult(item.id(), item.title(), item.content(), item.scope(),
                item.authorNickname(), item.createdAt());
    }

    private static AnnouncementListResult.Item toItem(AnnouncementSummaryProjection projection) {
        return new AnnouncementListResult.Item(projection.id(), projection.title(), projection.scope(),
                projection.authorNickname(), projection.createdAt());
    }

    private static void validateQuery(long groupId, AnnouncementListQuery query) {
        if (groupId < 1 || query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
    }

    private static String encodeCursor(AnnouncementSummaryProjection projection) {
        String value = projection.createdAt() + "|" + projection.id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
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

    private record Cursor(LocalDateTime createdAt, long id) {
    }
}
