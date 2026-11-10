package com.project.jarihana.share.query.service.dto;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

public record SharePreviewResult(
        String title,
        String description,
        String canonicalUrl,
        String imageUrl,
        String redirectUrl,
        String linkText
) {

    public SharePreviewResult {
        if (title == null || description == null || canonicalUrl == null
                || imageUrl == null || redirectUrl == null || linkText == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공유 미리보기 정보가 올바르지 않습니다.");
        }
    }
}
