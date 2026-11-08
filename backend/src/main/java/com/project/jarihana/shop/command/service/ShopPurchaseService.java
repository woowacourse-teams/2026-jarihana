package com.project.jarihana.shop.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.shop.command.repository.ShopPurchaseRepository;
import com.project.jarihana.shop.command.service.dto.PurchaseProductCommand;
import com.project.jarihana.shop.command.service.dto.ShopPurchaseResult;
import com.project.jarihana.shop.config.ShopAvailability;
import com.project.jarihana.shop.domain.ShopProduct;
import com.project.jarihana.shop.domain.ShopPurchase;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class ShopPurchaseService {
    private final ShopPurchaseRepository repository;
    private final ShopAvailability availability;
    private final Clock clock;

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ShopPurchaseResult purchase(long memberId, PurchaseProductCommand command) {
        availability.requireEnabled();
        repository.lockWallet(memberId);
        var previous = repository.findPurchase(memberId, command.requestId());
        if (previous.isPresent()) {
            previous.get().validateReplay(command.productId(), command.termsVersion());
            return new ShopPurchaseResult(previous.get(), repository.account(memberId));
        }
        ShopProduct product = repository.findProductWithLock(command.productId()).orElseThrow(() ->
                new BusinessException(ErrorCode.PRODUCT_UNAVAILABLE, "판매 중인 상품이 아닙니다."));
        product.validatePurchase(command.termsVersion());
        if (repository.owns(memberId, product.definition().grant().itemId())) {
            throw new BusinessException(ErrorCode.ALREADY_OWNED, "이미 보유한 아이템입니다.");
        }
        if (!repository.debit(memberId, product.definition().price())) {
            throw new BusinessException(ErrorCode.INSUFFICIENT_POINTS, "포인트가 부족합니다.");
        }
        ShopPurchase purchase = repository.record(memberId, command.requestId(), product, LocalDateTime.now(clock));
        return new ShopPurchaseResult(purchase, repository.account(memberId));
    }
}
