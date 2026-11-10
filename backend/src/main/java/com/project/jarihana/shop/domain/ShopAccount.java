package com.project.jarihana.shop.domain;

import java.util.List;

public record ShopAccount(long balance, List<OwnedItem> items) {
    public static ShopAccount of(long balance, List<OwnedItem> items) {
        return new ShopAccount(balance, items);
    }

    public record OwnedItem(ShopProduct.Definition definition, boolean equipped) { }

    public ShopAccount {
        items = List.copyOf(items);
    }
}
