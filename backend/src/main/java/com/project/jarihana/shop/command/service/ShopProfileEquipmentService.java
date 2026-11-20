package com.project.jarihana.shop.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.shop.command.repository.ShopPurchaseRepository;
import com.project.jarihana.shop.domain.ShopAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ShopProfileEquipmentService {
    private final ShopPurchaseRepository repository;

    @Transactional
    public List<ShopAccount.OwnedItem> changeEquipment(long memberId, String itemId, boolean equipped) {
        if (!repository.ownsProfileFrame(memberId, itemId)) {
            throw new BusinessException(ErrorCode.ITEM_NOT_OWNED, "보유한 프로필 프레임만 적용할 수 있습니다.");
        }
        if (equipped) {
            repository.equipProfileFrame(memberId, itemId);
        } else {
            repository.unequipProfileFrame(memberId, itemId);
        }
        return repository.ownedItems(memberId);
    }
}
