package com.project.jarihana.shop.command.controller.dto;

import com.project.jarihana.shop.command.service.dto.ShopPurchaseResult;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse.InventoryResponse;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse.WalletResponse;

public record ShopPurchaseResponse(String purchaseId, String productId, WalletResponse wallet,
                                   InventoryResponse inventory) {
    public static ShopPurchaseResponse from(ShopPurchaseResult result) {
        ShopAccountResponse account = ShopAccountResponse.from(result.account());
        return new ShopPurchaseResponse(result.purchase().id().toString(), result.purchase().productId(),
                account.wallet(), account.inventory());
    }
}
