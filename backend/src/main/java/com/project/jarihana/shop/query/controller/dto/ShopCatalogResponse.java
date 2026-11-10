package com.project.jarihana.shop.query.controller.dto;

import com.project.jarihana.shop.domain.ShopProduct;
import com.project.jarihana.shop.query.controller.dto.ShopAccountResponse.PreviewResponse;
import java.util.List;

public record ShopCatalogResponse(boolean purchasingEnabled, List<CategoryResponse> categories,
                                  List<ProductResponse> products) {
    public static ShopCatalogResponse from(boolean enabled, List<ShopProduct> products) {
        return new ShopCatalogResponse(enabled,
                List.of(new CategoryResponse("wear", "아바타 꾸미기"), new CategoryResponse("profile", "프로필 꾸미기"))
                        .stream().filter(category -> products.stream()
                                .anyMatch(product -> category.id().equals(product.definition().categoryId())))
                        .toList(),
                products.stream().map(ProductResponse::from).toList());
    }
    public record CategoryResponse(String id, String label) { }
    public record GrantResponse(String itemId, String slot) { }
    public record ProductResponse(String id, String name, String description, String categoryId,
                                  long price, String termsVersion, String status,
                                  PreviewResponse preview, GrantResponse grant) {
        static ProductResponse from(ShopProduct product) {
            var definition = product.definition();
            return new ProductResponse(product.id(), definition.name(), definition.description(),
                    definition.categoryId(), definition.price(), product.termsVersion(),
                    product.available() ? "AVAILABLE" : "ENDED", PreviewResponse.from(definition.preview()),
                    new GrantResponse(definition.grant().itemId(), definition.grant().slot()));
        }
    }
}
