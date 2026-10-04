package com.project.jarihana.notification.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.notification.query.repository.NotificationQueryRepository;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;
import com.project.jarihana.notification.query.service.dto.NotificationItemResult;
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
                PageRequest.of(0, query.size()));
        List<NotificationProjection> items = page.getContent();
        String next = page.hasNext() ? encode(items.getLast()) : null;
        return new NotificationListResult(items.stream().map(NotificationItemResult::from).toList(), next, page.hasNext());
    }

    public NotificationItemResult findNotification(long memberId, long id) {
        requireMember(memberId);
        if (id <= 0) {
            throw invalidParameter();
        }
        return notifications.findActiveByIdAndMemberId(id, memberId).map(NotificationItemResult::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND, "알림을 찾을 수 없습니다."));
    }

    public long countUnreadNotifications(long memberId) {
        requireMember(memberId);
        return notifications.countUnread(memberId);
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
