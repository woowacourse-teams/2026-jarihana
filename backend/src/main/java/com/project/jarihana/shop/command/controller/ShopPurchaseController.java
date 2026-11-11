package com.project.jarihana.shop.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.shop.command.controller.dto.PurchaseProductRequest;
import com.project.jarihana.shop.command.controller.dto.ShopPurchaseResponse;
import com.project.jarihana.shop.command.service.ShopPurchaseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/members/me/shop/purchases")
@RequiredArgsConstructor
public class ShopPurchaseController {
    private final ShopPurchaseService service;

    @PostMapping
    public ResponseEntity<ApiResponse<ShopPurchaseResponse>> purchaseProduct(
            @LoginMember long memberId, @Valid @RequestBody PurchaseProductRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                ShopPurchaseResponse.from(service.purchase(memberId, request.toCommand()))));
    }
}
