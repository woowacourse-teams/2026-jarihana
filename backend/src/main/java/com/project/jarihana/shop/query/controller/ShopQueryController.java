package com.project.jarihana.shop.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.shop.config.ShopAvailability;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse.ItemResponse;
import com.project.jarihana.shop.query.controller.dto.ShopCatalogResponse;
import com.project.jarihana.shop.query.service.ShopQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class ShopQueryController {
    private final ShopQueryService service;
    private final ShopAvailability availability;

    @GetMapping("/shop/products")
    public ResponseEntity<ApiResponse<ShopCatalogResponse>> findProducts() {
        return ResponseEntity.ok(ApiResponse.success(ShopCatalogResponse.from(availability.isEnabled(), service.catalog())));
    }

    @GetMapping("/members/me/shop/equipment")
    public ResponseEntity<ApiResponse<List<ItemResponse>>> findProfileEquipment(@LoginMember long memberId) {
        var equipment = service.profileEquipment(memberId).stream().map(ItemResponse::from).toList();
        return ResponseEntity.ok(ApiResponse.success(equipment));
    }

    @GetMapping("/members/me/shop")
    public ResponseEntity<ApiResponse<ShopAccountResponse>> findMyShop(@LoginMember long memberId) {
        return ResponseEntity.ok(ApiResponse.success(ShopAccountResponse.from(service.account(memberId))));
    }
}
