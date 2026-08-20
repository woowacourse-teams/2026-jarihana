package com.project.jarihana.recruitment.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.recruitment.query.repository.RecruitmentDetailRepository;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentDetailProjection;
import com.project.jarihana.recruitment.query.service.dto.RecruitmentDetailResult;
import java.time.Clock;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;

@Service
public class RecruitmentQueryService {

    private final RecruitmentDetailRepository recruitmentDetailRepository;
    private final Clock clock;

    public RecruitmentQueryService(
            RecruitmentDetailRepository recruitmentDetailRepository,
            Clock clock
    ) {
        this.recruitmentDetailRepository = recruitmentDetailRepository;
        this.clock = clock;
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

    private static void validateId(Long id) {
        if (id == null || id < 1) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
        }
    }
}
