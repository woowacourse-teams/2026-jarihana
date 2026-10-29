package com.project.jarihana.notification.query.service;

import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.query.repository.NotificationQueryRepository;
import com.project.jarihana.notification.query.repository.dto.ActivityPostReactionSummaryProjection;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;
import com.project.jarihana.notification.query.repository.dto.NotificationGroupProjection;
import com.project.jarihana.notification.query.service.dto.NotificationItemResult;
import com.project.jarihana.notification.query.service.dto.NotificationClientVersion;
import com.project.jarihana.notification.query.service.dto.NotificationListQuery;
import com.project.jarihana.notification.query.service.dto.NotificationListResult;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NotificationQueryService {

    private final NotificationQueryRepository notifications;
    private final MemberRepository members;

    public NotificationListResult findNotifications(long memberId, NotificationListQuery query) {
        requireMember(memberId);
        if (query == null || query.size() < 1 || query.size() > 100) {
            throw invalidParameter();
        }
        Cursor cursor = decode(query.cursor());
        Slice<NotificationProjection> page = notifications.findPage(memberId,
                cursor == null ? null : cursor.createdAt(), cursor == null ? null : cursor.id(),
                query.clientVersion().includesAnnouncements(),
                PageRequest.of(0, query.size()));
        List<NotificationProjection> items = page.getContent();
        String next = page.hasNext() ? encode(items.getLast()) : null;
        Map<Long, String> groupNames = findGroupNames(items);
        Map<Long, ActivityPostReactionSummaryProjection> reactions = findReactionSummaries(items);
        return new NotificationListResult(items.stream()
                .map(item -> NotificationItemResult.from(item, groupNames.get(item.payload().getGroupId()),
                        reactionOf(reactions, item)))
                .toList(), next, page.hasNext());
    }

    public NotificationItemResult findNotification(long memberId, long id, NotificationClientVersion clientVersion) {
        requireMember(memberId);
        if (id <= 0) {
            throw invalidParameter();
        }
        NotificationProjection item = notifications.findActiveByIdAndMemberId(id, memberId, clientVersion.includesAnnouncements())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND, "알림을 찾을 수 없습니다."));
        Map<Long, String> groupNames = findGroupNames(List.of(item));
        Map<Long, ActivityPostReactionSummaryProjection> reactions = findReactionSummaries(List.of(item));
        return NotificationItemResult.from(item, groupNames.get(item.payload().getGroupId()), reactionOf(reactions, item));
    }

    private static ActivityPostReactionSummaryProjection reactionOf(
            Map<Long, ActivityPostReactionSummaryProjection> reactions, NotificationProjection item) {
        if (item.eventType() != NotificationEventType.ACTIVITY_POST_REACTED) {
            return null;
        }
        return reactions.get(item.payload().getActivityPostId());
    }

    /**
     * 좋아요 알림만 활동 기록별 현재 좋아요 요약을 한 번에 조회한다.
     */
    private Map<Long, ActivityPostReactionSummaryProjection> findReactionSummaries(List<NotificationProjection> items) {
        List<Long> activityPostIds = items.stream()
                .filter(item -> item.eventType() == NotificationEventType.ACTIVITY_POST_REACTED)
                .map(item -> item.payload().getActivityPostId()).distinct().toList();
        if (activityPostIds.isEmpty()) {
            return Map.of();
        }
        return notifications.findReactionSummaries(activityPostIds, ReactionEmoji.HEART).stream()
                .collect(Collectors.toMap(ActivityPostReactionSummaryProjection::activityPostId, summary -> summary));
    }

    private Map<Long, String> findGroupNames(List<NotificationProjection> items) {
        if (items.isEmpty()) {
            return Map.of();
        }
        List<Long> groupIds = items.stream().map(item -> item.payload().getGroupId()).distinct().toList();
        return notifications.findGroupNames(groupIds).stream()
                .collect(Collectors.toMap(NotificationGroupProjection::id, NotificationGroupProjection::name));
    }

    public long countUnreadNotifications(long memberId, NotificationClientVersion clientVersion) {
        requireMember(memberId);
        return notifications.countUnread(memberId, clientVersion.includesAnnouncements());
    }

    private void requireMember(long memberId) {
        members.findById(memberId).orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
    }

    private static String encode(NotificationProjection item) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                ("1|" + item.createdAt() + "|" + item.id()).getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decode(String value) {
        if (value == null) {
            return null;
        }
        if (value.isBlank() || value.length() > 256) {
            throw invalidParameter();
        }
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", -1);
            if (parts.length != 3 || !parts[0].equals("1")) {
                throw invalidParameter();
            }
            LocalDateTime createdAt = LocalDateTime.parse(parts[1]);
            long id = Long.parseLong(parts[2]);
            if (id <= 0 || createdAt.getYear() < 1 || createdAt.getYear() > 9999) {
                throw invalidParameter();
            }
            return new Cursor(createdAt, id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidParameter();
        }
    }

    private static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    private record Cursor(LocalDateTime createdAt, long id) { }
}
