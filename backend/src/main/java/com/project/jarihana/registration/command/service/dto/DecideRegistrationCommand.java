package com.project.jarihana.registration.command.service.dto;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

public record DecideRegistrationCommand(
        RegistrationDecision status,
        String decisionReason
) {

    public DecideRegistrationCommand {
        if (status == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "신청 처리 상태는 필수입니다.");
        }
        if (status == RegistrationDecision.APPROVED && decisionReason != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "승인 요청에는 결정 사유를 입력할 수 없습니다.");
        }
        if (decisionReason != null && decisionReason.length() > 1_000) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "결정 사유는 1000자 이하여야 합니다.");
        }
    }
}
