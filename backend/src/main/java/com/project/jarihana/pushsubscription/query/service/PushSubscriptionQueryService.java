package com.project.jarihana.pushsubscription.query.service;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.pushsubscription.query.repository.PushSubscriptionQueryRepository;
import com.project.jarihana.pushsubscription.query.service.dto.PushSubscriptionListQuery;
import com.project.jarihana.pushsubscription.query.service.dto.PushSubscriptionListResult;
import com.project.jarihana.pushsubscription.query.service.dto.PushSubscriptionListResult.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import com.project.jarihana.pushsubscription.config.PushProperties;
import com.project.jarihana.pushsubscription.query.service.dto.PushConfigResult;

@Service
@RequiredArgsConstructor
public class PushSubscriptionQueryService {
    private final PushSubscriptionQueryRepository subscriptions;
    private final MemberRepository members;
    private final PushProperties properties;

    public PushConfigResult findPushConfig(long memberId) {
        members.findById(memberId).orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
        return new PushConfigResult(properties.enabled(), properties.enabled() ? properties.vapidPublicKey() : null, List.of(1));
    }

    public PushSubscriptionListResult findSubscriptions(long memberId, PushSubscriptionListQuery query) {
        members.findById(memberId).orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, "인증 정보가 필요합니다."));
        if (query.size() < 1 || query.size() > 100) { throw invalid(); }
        Cursor cursor = decode(query.cursor());
        var page = subscriptions.findPage(memberId, cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(), PageRequest.of(0, query.size()));
        var items = page.getContent();
        String next = null;
        if (page.hasNext()) {
            var last = items.getLast();
            next = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    ("1|" + last.createdAt() + "|" + last.id()).getBytes(StandardCharsets.UTF_8));
        }
        return new PushSubscriptionListResult(items.stream().map(s -> new Item(s.id(), s.generation(), s.enabled(), s.lastSeenAt())).toList(),
                next, page.hasNext());
    }

    private static Cursor decode(String value) {
        if (value == null) { return null; }
        if (value.isBlank() || value.length() > 256) { throw invalid(); }
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", -1);
            if (parts.length != 3 || !parts[0].equals("1")) { throw invalid(); }
            LocalDateTime time = LocalDateTime.parse(parts[1]);
            long id = Long.parseLong(parts[2]);
            if (id <= 0 || time.getYear() < 1 || time.getYear() > 9999) { throw invalid(); }
            return new Cursor(time, id);
        } catch (IllegalArgumentException | DateTimeParseException exception) { throw invalid(); }
    }

    private record Cursor(LocalDateTime createdAt, long id) { }
    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }
}
