package com.project.jarihana.shop.command.service.dto;

import java.util.UUID;

public record PurchaseProductCommand(String productId, String termsVersion, UUID requestId, long expectedMemberId) { }
