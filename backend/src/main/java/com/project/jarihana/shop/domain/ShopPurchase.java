package com.project.jarihana.shop.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.util.UUID;

public record ShopPurchase(UUID id, String productId, String termsVersion) {
    public static ShopPurchase of(UUID id, String productId, String termsVersion) {
        return new ShopPurchase(id, productId, termsVersion);
    }

    public void validateReplay(String product, String version) {
        if (!productId.equals(product) || !termsVersion.equals(version)) {
            throw new BusinessException(ErrorCode.REQUEST_CONFLICT, "구매 요청의 정보가 일치하지 않습니다.");
        }
    }
}
