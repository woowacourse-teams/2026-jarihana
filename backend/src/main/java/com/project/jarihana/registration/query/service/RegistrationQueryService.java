package com.project.jarihana.registration.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.registration.query.repository.RegistrationListRepository;
import com.project.jarihana.registration.query.repository.dto.RegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.RegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.RegistrationListSearchCriteria;
import com.project.jarihana.registration.query.service.dto.RegistrationListQuery;
import com.project.jarihana.registration.query.service.dto.RegistrationListResult;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class RegistrationQueryService {

    private static final int MAX_SIZE = 100;
    private static final String INVALID_PARAMETER_MESSAGE = "요청 파라미터가 올바르지 않습니다.";

    private final RegistrationListRepository registrationListRepository;

    public RegistrationQueryService(RegistrationListRepository registrationListRepository) {
        this.registrationListRepository = registrationListRepository;
    }

    public RegistrationListResult findRegistrations(
            Long memberId,
            Long recruitmentId,
            RegistrationListQuery query
    ) {
        validateRequest(memberId, recruitmentId, query);
        Long groupId = registrationListRepository.findGroupIdByRecruitmentId(recruitmentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RECRUITMENT_NOT_FOUND,
                        "모집 공고를 찾을 수 없습니다."
                ));
        if (!registrationListRepository.existsLeaderByGroupIdAndMemberId(groupId, memberId)) {
            throw new BusinessException(
                    ErrorCode.RECRUITMENT_ACCESS_DENIED,
                    "모집 공고가 속한 그룹의 모임장만 신청자 목록을 조회할 수 있습니다."
            );
        }

        Cursor cursor = decodeCursor(query.cursor());
        RegistrationListPage page = registrationListRepository.findPage(
                new RegistrationListSearchCriteria(
                        recruitmentId,
                        query.status(),
                        cursor == null ? null : cursor.registeredAt(),
                        cursor == null ? null : cursor.id()
                ),
                query.size()
        );
        List<RegistrationListProjection> projections = page.items();
        String nextCursor = page.hasNext()
                ? encodeCursor(projections.get(projections.size() - 1))
                : null;
        return new RegistrationListResult(
                projections.stream().map(RegistrationQueryService::toResult).toList(),
                nextCursor,
                page.hasNext()
        );
    }

    private static RegistrationListResult.Item toResult(RegistrationListProjection projection) {
        return new RegistrationListResult.Item(
                projection.id(),
                projection.memberId(),
                projection.crewName(),
                projection.generation(),
                projection.course().name(),
                projection.message(),
                projection.status().name(),
                projection.registeredAt(),
                projection.decisionReason(),
                projection.decidedAt(),
                projection.decidedByType() == null ? null : projection.decidedByType().name(),
                projection.decidedByMemberId()
        );
    }

    private static void validateRequest(
            Long memberId,
            Long recruitmentId,
            RegistrationListQuery query
    ) {
        if (memberId == null || memberId < 1
                || recruitmentId == null || recruitmentId < 1
                || query == null
                || query.size() < 1
                || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
    }

    private static String encodeCursor(RegistrationListProjection projection) {
        String value = projection.registeredAt() + "|" + projection.id();
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
                throw invalidParameter();
            }
            LocalDateTime registeredAt = LocalDateTime.parse(values[0]);
            long id = Long.parseLong(values[1]);
            if (id < 1) {
                throw invalidParameter();
            }
            return new Cursor(registeredAt, id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidParameter();
        }
    }

    private static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, INVALID_PARAMETER_MESSAGE);
    }

    private record Cursor(LocalDateTime registeredAt, long id) {
    }
}
