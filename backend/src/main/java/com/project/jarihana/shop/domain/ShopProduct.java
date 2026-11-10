package com.project.jarihana.shop.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.util.Map;

public record ShopProduct(String id, String termsVersion, boolean available, Definition definition) {
    public static ShopProduct of(String id, String termsVersion, boolean available, Definition definition) {
        return new ShopProduct(id, termsVersion, available, definition);
    }

    public void validatePurchase(String version) {
        if (!available) {
            throw new BusinessException(ErrorCode.PRODUCT_UNAVAILABLE, "판매 중인 상품이 아닙니다.");
        }
        if (!termsVersion.equals(version)) {
            throw new BusinessException(ErrorCode.TERMS_CHANGED, "상품 조건이 바뀌었습니다. 다시 확인해 주세요.");
        }
    }

    public record Definition(String name, String description, String categoryId, long price,
                             Preview preview, Grant grant) { }
    public record Preview(String type, String art, String tone, Map<String, String> appearance) {
        public Preview {
            appearance = appearance == null ? Map.of() : Map.copyOf(appearance);
        }
    }
    public record Grant(String itemId, String slot) { }
}
