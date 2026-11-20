package com.project.jarihana.shop.command.service.dto;

import com.project.jarihana.shop.domain.ShopAccount;
import com.project.jarihana.shop.domain.ShopPurchase;

public record ShopPurchaseResult(ShopPurchase purchase, ShopAccount account) { }
