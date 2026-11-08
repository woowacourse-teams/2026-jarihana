package com.project.jarihana.shop.command.controller.dto;

import com.project.jarihana.shop.command.service.dto.PurchaseProductCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record PurchaseProductRequest(@NotBlank @Size(max = 64) String productId,
                                     @NotBlank @Size(max = 64) String termsVersion,
                                     @NotNull UUID requestId) {
    public PurchaseProductCommand toCommand() {
        return new PurchaseProductCommand(productId, termsVersion, requestId);
    }
}
