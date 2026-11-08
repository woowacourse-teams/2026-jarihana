package com.project.jarihana.shop.query.repository;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.shop.domain.ShopAccount;
import com.project.jarihana.shop.domain.ShopProduct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class ShopQueryRepository {
    private final JdbcClient jdbc;
    private final JsonMapper json;

    public List<ShopProduct> catalog() {
        return jdbc.sql("""
                SELECT id, md5(definition::text || available::text), available, definition::text
                FROM shop_product ORDER BY created_at, id
                """).query((row, index) -> ShopProduct.of(row.getString(1), row.getString(2),
                        row.getBoolean(3), json.readValue(row.getString(4), ShopProduct.Definition.class))).list();
    }

    public ShopAccount account(long memberId) {
        if (!jdbc.sql("SELECT EXISTS (SELECT 1 FROM member WHERE id = ?)").param(memberId).query(Boolean.class).single()) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "로그인이 필요합니다.");
        }
        long balance = jdbc.sql("SELECT balance FROM point_wallet WHERE member_id = ?")
                .param(memberId).query(Long.class).optional().orElse(0L);
        var items = jdbc.sql("SELECT item_snapshot::text FROM shop_purchase WHERE member_id = ? ORDER BY created_at, id")
                .param(memberId).query((row, index) -> json.readValue(row.getString(1), ShopProduct.Definition.class)).list();
        return ShopAccount.of(balance, items);
    }
}
