package com.project.jarihana.recruitment.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.recruitment.query.repository.RecruitmentDetailRepository;
import com.project.jarihana.recruitment.query.repository.RecruitmentListRepository;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentDetailProjection;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListPage;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListProjection;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListSearchCriteria;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentDetailResult;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentListQuery;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentListResult;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentListResult.Item;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;

@Service
public class RecruitmentQueryService {

    private static final int MAX_SIZE = 100;

    private final RecruitmentDetailRepository recruitmentDetailRepository;
    private final RecruitmentListRepository recruitmentListRepository;
    private final Clock clock;

    public RecruitmentQueryService(
            RecruitmentDetailRepository recruitmentDetailRepository,
            RecruitmentListRepository recruitmentListRepository,
            Clock clock
    ) {
        this.recruitmentDetailRepository = recruitmentDetailRepository;
        this.recruitmentListRepository = recruitmentListRepository;
        this.clock = clock;
    }

    public RecruitmentListResult findRecruitments(Long groupId, RecruitmentListQuery query) {
        validateId(groupId);
        validateQuery(query);
        if (!recruitmentListRepository.existsGroupById(groupId)) {
            throw new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
        }

        Cursor cursor = decodeCursor(query.cursor());
        RecruitmentListPage page = recruitmentListRepository.findPage(
                new RecruitmentListSearchCriteria(
                        groupId,
                        cursor == null ? null : cursor.createdAt(),
                        cursor == null ? null : cursor.id()
                ),
                query.size()
        );
        List<RecruitmentListProjection> projections = page.items();
        String nextCursor = page.hasNext()
                ? encodeCursor(projections.get(projections.size() - 1))
                : null;
        LocalDateTime now = LocalDateTime.now(clock);
        List<Item> items = projections.stream()
                .map(projection -> Item.of(
                        projection.recruitment(),
                        projection.approvedCount(),
                        now
                ))
                .toList();
        return new RecruitmentListResult(items, nextCursor, page.hasNext());
    }

    private static void validateId(Long id) {
        if (id == null || id < 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
    }

    private static void validateQuery(RecruitmentListQuery query) {
        if (query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
    }

    private static String encodeCursor(RecruitmentListProjection projection) {
        String value = projection.recruitment().getCreatedAt() + "|" + projection.recruitment().getId();
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String decoded = new String(
                    Base64.getUrlDecoder().decode(cursor),
                    StandardCharsets.UTF_8
            );
            String[] values = decoded.split("\\|", -1);
            if (values.length != 2) {
                throw invalidCursor();
            }
            LocalDateTime createdAt = LocalDateTime.parse(values[0]);
            long id = Long.parseLong(values[1]);
            if (id < 1) {
                throw invalidCursor();
            }
            return new Cursor(createdAt, id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidCursor();
        }
    }

    private static BusinessException invalidCursor() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    public RecruitmentDetailResult findRecruitment(Long groupId, Long recruitmentId) {
        validateId(groupId);
        validateId(recruitmentId);
        recruitmentDetailRepository.findGroupById(groupId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.GROUP_NOT_FOUND,
                        "그룹을 찾을 수 없습니다."
                ));
        RecruitmentDetailProjection projection = recruitmentDetailRepository
                .findByGroupIdAndRecruitmentId(groupId, recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        return RecruitmentDetailResult.of(
                projection.group(),
                projection.recruitment(),
                projection.approvedCount(),
                LocalDateTime.now(clock)
        );
    }

    private record Cursor(LocalDateTime createdAt, long id) {
    }
}
