package com.project.jarihana.activitypost.query.service;

import com.project.jarihana.activitypost.query.repository.ActivityPostQueryRepository;
import com.project.jarihana.activitypost.query.repository.dto.ActivityPostProjection;
import com.project.jarihana.activitypost.query.service.dto.ActivityPostListQuery;
import com.project.jarihana.activitypost.query.service.dto.ActivityPostListResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import com.project.jarihana.image.config.ImageProperties;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivityPostQueryService {

    private static final int MAX_SIZE = 100;

    private final ActivityPostQueryRepository activityPostQueryRepository;
    private final GroupJpaRepository groupRepository;
    private final String publicBaseUrl;

    public ActivityPostQueryService(
            ActivityPostQueryRepository activityPostQueryRepository,
            GroupJpaRepository groupRepository,
            ImageProperties imageProperties
    ) {
        this.activityPostQueryRepository = activityPostQueryRepository;
        this.groupRepository = groupRepository;
        this.publicBaseUrl = imageProperties.publicBaseUrl();
    }

    @Transactional(readOnly = true)
    public ActivityPostListResult find(Long groupId, ActivityPostListQuery query, Long memberId) {
        validateQuery(query, memberId);
        if (groupId != null && !groupRepository.existsById(groupId)) {
            throw new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
        }

        Cursor cursor = decodeCursor(query.cursor());
        List<ActivityPostProjection> candidates = activityPostQueryRepository.findPage(
                groupId,
                query.onlyMine(),
                memberId,
                cursor == null ? null : cursor.activityDate(),
                cursor == null ? null : cursor.id(),
                Pageable.ofSize(query.size() + 1)
        );
        boolean hasNext = candidates.size() > query.size();
        List<ActivityPostProjection> page = hasNext
                ? candidates.subList(0, query.size())
                : candidates;
        String nextCursor = hasNext ? encodeCursor(page.get(page.size() - 1)) : null;
        return new ActivityPostListResult(
                page.stream().map(this::toResult).toList(),
                nextCursor,
                hasNext
        );
    }

    private static void validateQuery(ActivityPostListQuery query, Long memberId) {
        if (query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
        if (query.onlyMine() && memberId == null) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "내 활동 기록을 보려면 로그인이 필요합니다.");
        }
    }

    private ActivityPostListResult.Item toResult(ActivityPostProjection projection) {
        return new ActivityPostListResult.Item(
                projection.id(),
                new ActivityPostListResult.Group(
                        projection.groupId(),
                        projection.groupName(),
                        projection.groupType().name(),
                        projection.groupStatus().name()
                ),
                projection.authorNickname(),
                toImageUrl(projection.imageKey()),
                projection.caption(),
                projection.activityDate(),
                projection.createdAt(),
                projection.canModify()
        );
    }

    private String toImageUrl(String imageKey) {
        if (publicBaseUrl.isBlank()) {
            return imageKey;
        }
        return publicBaseUrl.replaceAll("/+$", "") + "/" + imageKey.replaceFirst("^/+", "");
    }

    private static String encodeCursor(ActivityPostProjection projection) {
        String value = projection.activityDate() + "|" + projection.id();
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
            return new Cursor(LocalDate.parse(values[0]), id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidParameter();
        }
    }

    private static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    private record Cursor(LocalDate activityDate, long id) {
    }
}
