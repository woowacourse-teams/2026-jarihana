package com.project.jarihana.shop.command.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChangeShopEquipmentRequest(
        @NotBlank @Size(max = 64) String itemId,
        @NotNull Boolean equipped
) { }
