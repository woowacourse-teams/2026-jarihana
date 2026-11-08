package com.project.jarihana.shop.command.repository;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.shop.domain.ShopAccount;
import com.project.jarihana.shop.domain.ShopProduct;
import com.project.jarihana.shop.domain.ShopPurchase;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class ShopPurchaseRepository {
    private final JdbcClient jdbc;
    private final JsonMapper json;

    // Shares the exact row that #589's reward worker increments; never locks reward rows.
    public long lockWallet(long memberId) {
        jdbc.sql("INSERT INTO point_wallet(member_id) SELECT id FROM member WHERE id = ? ON CONFLICT DO NOTHING")
                .param(memberId).update();
        return jdbc.sql("UPDATE point_wallet SET balance = balance WHERE member_id = ? RETURNING balance")
                .param(memberId).query(Long.class).optional().orElseThrow(() ->
                        new BusinessException(ErrorCode.UNAUTHENTICATED, "로그인이 필요합니다."));
    }

    public Optional<ShopPurchase> findPurchase(long memberId, UUID requestId) {
        return jdbc.sql("SELECT id, product_id, terms_version FROM shop_purchase WHERE member_id = ? AND request_id = ?")
                .params(memberId, requestId).query((row, index) -> ShopPurchase.of(row.getObject(1, UUID.class),
                        row.getString(2), row.getString(3))).optional();
    }

    public Optional<ShopProduct> findProductWithLock(String id) {
        return jdbc.sql("""
                SELECT id, md5(definition::text || available::text), available, definition::text
                FROM shop_product WHERE id = ? FOR SHARE
                """).param(id).query((row, index) -> ShopProduct.of(row.getString(1), row.getString(2),
                        row.getBoolean(3), json.readValue(row.getString(4), ShopProduct.Definition.class))).optional();
    }

    public boolean owns(long memberId, String itemId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM shop_purchase WHERE member_id = ? AND item_id = ?)")
                .params(memberId, itemId).query(Boolean.class).single();
    }

    public boolean debit(long memberId, long amount) {
        return jdbc.sql("UPDATE point_wallet SET balance = balance - ? WHERE member_id = ? AND balance >= ?")
                .params(amount, memberId, amount).update() == 1;
    }

    public ShopPurchase record(long memberId, UUID requestId, ShopProduct product, LocalDateTime now) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO shop_purchase(id, member_id, request_id, product_id, terms_version,
                                          amount, item_id, item_snapshot, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
                """).params(id, memberId, requestId, product.id(), product.termsVersion(),
                        product.definition().price(), product.definition().grant().itemId(),
                        json.writeValueAsString(product.definition()), now).update();
        return ShopPurchase.of(id, product.id(), product.termsVersion());
    }

    public ShopAccount account(long memberId) {
        long balance = jdbc.sql("SELECT balance FROM point_wallet WHERE member_id = ?")
                .param(memberId).query(Long.class).single();
        var items = jdbc.sql("SELECT item_snapshot::text FROM shop_purchase WHERE member_id = ? ORDER BY created_at, id")
                .param(memberId).query((row, index) -> json.readValue(row.getString(1), ShopProduct.Definition.class)).list();
        return ShopAccount.of(balance, items);
    }
}
