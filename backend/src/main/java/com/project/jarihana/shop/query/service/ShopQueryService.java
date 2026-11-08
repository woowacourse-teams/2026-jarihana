package com.project.jarihana.shop.query.service;

import com.project.jarihana.shop.config.ShopAvailability;
import com.project.jarihana.shop.domain.ShopAccount;
import com.project.jarihana.shop.domain.ShopProduct;
import com.project.jarihana.shop.query.repository.ShopQueryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ShopQueryService {
    private final ShopQueryRepository repository;
    private final ShopAvailability availability;

    public List<ShopProduct> catalog() {
        return availability.isEnabled() ? repository.catalog() : List.of();
    }

    // The balance and item grants must come from the same committed purchase snapshot.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ShopAccount account(long memberId) {
        availability.requireEnabled();
        return repository.account(memberId);
    }
}
