package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import java.util.EnumMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AvatarAppearanceTest {

    @Test
    @DisplayName("기본 아바타는 머리와 안경 없이 작은 눈과 코를 가진다.")
    void createsMinimalDefaultAvatar() {
        // Given / When
        AvatarAppearance appearance = AvatarAppearance.basic();
        // Then
        assertThat(appearance.getHair()).isEqualTo("bald");
        assertThat(appearance.getGlasses()).isEqualTo("none");
        assertThat(appearance.getEyes()).isEqualTo("dot");
        assertThat(appearance.getNose()).isEqualTo("small");
        assertThat(appearance.getShoes()).isEqualTo("sneakers");
        assertThat(appearance.getShoeColor()).isEqualTo("white");
        assertThat(appearance.getHat()).isEqualTo("none");
        assertThat(appearance.getHatColor()).isEqualTo("ink");
        assertThat(appearance.getBag()).isEqualTo("none");
        assertThat(appearance.getHandheld()).isEqualTo("none");
    }

    @Test
    @DisplayName("허용하지 않은 버전·파츠와 필수 파츠 누락은 저장하지 않는다.")
    void rejectsUnknownPartsAndVersion() {
        // Given
        var selections = new EnumMap<>(AvatarCatalog.basicSelections());
        // When / Then
        assertThatThrownBy(() -> AvatarAppearance.of(2, selections)).isInstanceOf(BusinessException.class);
        for (AvatarCatalog slot : AvatarCatalog.values()) {
            var invalid = new EnumMap<>(selections);
            invalid.put(slot, "unknown");
            assertThatThrownBy(() -> AvatarAppearance.of(1, invalid)).isInstanceOf(BusinessException.class);
        }
        selections.remove(AvatarCatalog.SKIN);
        assertThatThrownBy(() -> AvatarAppearance.of(1, selections)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("누락된 확장 파츠는 도메인에서 기본값을 채운다.")
    void defaultsMissingExtensionPartsInDomain() {
        // Given
        var selections = new EnumMap<>(AvatarCatalog.basicSelections());
        for (AvatarCatalog slot : AvatarCatalog.values()) {
            if (slot.isOptional()) selections.put(slot, null);
        }
        // When
        AvatarAppearance appearance = AvatarAppearance.of(1, selections);
        // Then
        assertThat(appearance).usingRecursiveComparison().isEqualTo(AvatarAppearance.basic());
    }

    @Test
    @DisplayName("같은 허용 값을 쓰는 색상도 종류별로 저장하고 입력 변경에 영향받지 않는다.")
    void preservesNamedColorsAndCopiesSelections() {
        // Given
        var selections = new EnumMap<>(AvatarCatalog.basicSelections());
        selections.put(AvatarCatalog.HAT_COLOR, "coral");
        selections.put(AvatarCatalog.BAG_COLOR, "navy");
        // When
        AvatarAppearance appearance = AvatarAppearance.of(1, selections);
        selections.put(AvatarCatalog.HAT_COLOR, "mint");
        // Then
        assertThat(appearance.getHatColor()).isEqualTo("coral");
        assertThat(appearance.getBagColor()).isEqualTo("navy");
    }
}
