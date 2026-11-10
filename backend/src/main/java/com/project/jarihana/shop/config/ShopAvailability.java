package com.project.jarihana.shop.config;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class ShopAvailability {
    private final boolean enabled;
    private final JdbcClient jdbc;

    public ShopAvailability(@Value("${jarihana.shop.enabled:false}") boolean enabled, JdbcClient jdbc) {
        this.enabled = enabled;
        this.jdbc = jdbc;
    }

    public boolean isEnabled() {
        return enabled && jdbc.sql("SELECT to_regclass('point_wallet') IS NOT NULL")
                .query(Boolean.class).single();
    }

    public void requireEnabled() {
        if (!isEnabled()) {
            throw new BusinessException(ErrorCode.SHOP_UNAVAILABLE, "상점 구매를 준비하고 있습니다.");
        }
    }
}
