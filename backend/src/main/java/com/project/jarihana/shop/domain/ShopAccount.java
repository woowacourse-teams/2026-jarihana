package com.project.jarihana.shop.domain;

import java.util.List;

public record ShopAccount(long balance, List<ShopProduct.Definition> items) {
    public static ShopAccount of(long balance, List<ShopProduct.Definition> items) {
        return new ShopAccount(balance, items);
    }

    public ShopAccount {
        items = List.copyOf(items);
    }
}
