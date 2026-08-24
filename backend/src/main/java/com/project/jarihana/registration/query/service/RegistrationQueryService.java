package com.project.jarihana.registration.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.registration.query.repository.RegistrationListRepository;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.MyRegistrationListSearchCriteria;
import com.project.jarihana.registration.query.repository.dto.RegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.RegistrationListProjection;
import com.project.jarihana.registration.query.repository.dto.RegistrationListSearchCriteria;
import com.project.jarihana.registration.query.service.dto.MyRegistrationListResult;
import com.project.jarihana.registration.query.service.dto.RegistrationListQuery;
import com.project.jarihana.registration.query.service.dto.RegistrationListResult;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;

@Service
public class RegistrationQueryService {

    private static final int MAX_SIZE = 100;

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

    private static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    private static String encodeCursor(RegistrationListProjection projection) {
        return encodeCursor(projection.registeredAt(), projection.id());
    }

    private static String encodeCursor(LocalDateTime registeredAt, Long id) {
        String value = registeredAt + "|" + id;
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

    public MyRegistrationListResult findMyRegistrations(
            Long memberId,
            RegistrationListQuery query
    ) {
        validateMyRequest(memberId, query);
        Cursor cursor = decodeCursor(query.cursor());
        MyRegistrationListPage page = registrationListRepository.findMyPage(
                new MyRegistrationListSearchCriteria(
                        memberId,
                        query.status(),
                        cursor == null ? null : cursor.registeredAt(),
                        cursor == null ? null : cursor.id()
                ),
                query.size()
        );
        List<MyRegistrationListProjection> projections = page.items();
        MyRegistrationListProjection cursorItem = page.hasNext()
                ? projections.get(projections.size() - 1)
                : null;
        String nextCursor = cursorItem == null
                ? null
                : encodeCursor(cursorItem.registeredAt(), cursorItem.id());
        return new MyRegistrationListResult(
                projections.stream().map(RegistrationQueryService::toMyResult).toList(),
                nextCursor,
                page.hasNext()
        );
    }

    private static MyRegistrationListResult.Item toMyResult(MyRegistrationListProjection projection) {
        return new MyRegistrationListResult.Item(
                projection.id(),
                projection.groupId(),
                projection.groupName(),
                projection.recruitmentId(),
                projection.message(),
                projection.status().name(),
                projection.registeredAt(),
                projection.decisionReason(),
                projection.decidedAt(),
                projection.decidedByType() == null ? null : projection.decidedByType().name(),
                projection.decidedByMemberId()
        );
    }

    private static void validateMyRequest(Long memberId, RegistrationListQuery query) {
        if (memberId == null || memberId < 1
                || query == null
                || query.size() < 1
                || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
    }

    private record Cursor(LocalDateTime registeredAt, long id) {
    }
}
