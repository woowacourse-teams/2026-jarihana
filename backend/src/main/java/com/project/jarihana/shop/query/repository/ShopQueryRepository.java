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
        return ShopAccount.of(balance, ownedItems(memberId));
    }

    public List<ShopProduct.Definition> profileEquipment(long memberId) {
        return jdbc.sql("""
                SELECT p.item_snapshot::text
                FROM shop_profile_equipment e
                JOIN shop_purchase p USING (member_id, item_id)
                WHERE e.member_id = ?
                """).param(memberId).query((row, index) ->
                json.readValue(row.getString(1), ShopProduct.Definition.class)).list();
    }

    private List<ShopAccount.OwnedItem> ownedItems(long memberId) {
        return jdbc.sql("""
                SELECT p.item_snapshot::text, e.item_id IS NOT NULL AS equipped
                FROM shop_purchase p
                LEFT JOIN shop_profile_equipment e USING (member_id, item_id)
                WHERE p.member_id = ?
                ORDER BY p.created_at, p.id
                """).param(memberId).query((row, index) -> new ShopAccount.OwnedItem(
                        json.readValue(row.getString(1), ShopProduct.Definition.class), row.getBoolean(2))).list();
    }
}
