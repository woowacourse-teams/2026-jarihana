package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
    @DisplayName("허용하지 않은 파츠와 버전은 저장하지 않는다.")
    void rejectsUnknownPartsAndVersion() {
        // Given / When / Then
        assertThatThrownBy(() -> AvatarAppearance.of(2, "bald", "warm", "ink", "round", "dot",
                "straight", "small", "flat", "none", "cream", "sneakers", "white", "none", "ink", "none", "ink", "none"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> AvatarAppearance.of(1, "unknown", "warm", "ink", "round", "dot",
                "straight", "small", "flat", "none", "cream", "sneakers", "white", "none", "ink", "none", "ink", "none"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> AvatarAppearance.of(1, "bald", null, "ink", "round", "dot",
                "straight", "small", "flat", "none", "cream", "sneakers", "white", "none", "ink", "none", "ink", "none"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> AvatarAppearance.of(1, "bald", "warm", "ink", "round", "dot",
                "straight", "small", "flat", "none", "cream", "unknown", "white", "none", "ink", "none", "ink", "none"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> AvatarAppearance.of(1, "bald", "warm", "ink", "round", "dot",
                "straight", "small", "flat", "none", "cream", "sneakers", "unknown", "none", "ink", "none", "ink", "none"))
                .isInstanceOf(BusinessException.class);
    }
}
