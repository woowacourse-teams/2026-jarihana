package com.project.jarihana.shop.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.shop.command.controller.dto.ChangeShopEquipmentRequest;
import com.project.jarihana.shop.command.service.ShopProfileEquipmentService;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse.InventoryResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ShopEquipmentController {
    private final ShopProfileEquipmentService service;

    @PutMapping("/members/me/shop/equipment")
    public ResponseEntity<ApiResponse<InventoryResponse>> changeEquipment(
            @LoginMember long memberId, @Valid @RequestBody ChangeShopEquipmentRequest request) {
        var items = service.changeEquipment(memberId, request.itemId(), request.equipped());
        return ResponseEntity.ok(ApiResponse.success(InventoryResponse.from(items)));
    }
}
