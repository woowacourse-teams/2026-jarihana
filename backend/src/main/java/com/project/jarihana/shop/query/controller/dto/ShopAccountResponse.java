package com.project.jarihana.shop.query.controller.dto;

import com.project.jarihana.shop.domain.ShopAccount;
import com.project.jarihana.shop.domain.ShopProduct;
import java.util.List;
import java.util.Map;

public record ShopAccountResponse(WalletResponse wallet, InventoryResponse inventory) {
    public static ShopAccountResponse from(ShopAccount account) {
        return new ShopAccountResponse(new WalletResponse(account.balance(), "P"),
                new InventoryResponse(account.items().stream().map(ItemResponse::from).toList(), Map.of()));
    }
    public record WalletResponse(long balance, String unit) { }
    public record InventoryResponse(List<ItemResponse> items, Map<String, String> equipped) { }
    public record ItemResponse(String itemId, String slot, String name, String description,
                               String categoryId, PreviewResponse preview) {
        static ItemResponse from(ShopProduct.Definition item) {
            return new ItemResponse(item.grant().itemId(), item.grant().slot(), item.name(),
                    item.description(), item.categoryId(), PreviewResponse.from(item.preview()));
        }
    }
    public record PreviewResponse(String type, String art, String tone, Map<String, String> appearance) {
        public static PreviewResponse from(ShopProduct.Preview preview) {
            return new PreviewResponse(preview.type(), preview.art(), preview.tone(), preview.appearance());
        }
    }
}
