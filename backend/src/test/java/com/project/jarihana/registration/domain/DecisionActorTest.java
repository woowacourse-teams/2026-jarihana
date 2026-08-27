package com.project.jarihana.registration.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DecisionActorTest {

    @DisplayName("시스템 결정 주체에는 회원 ID가 없다.")
    @Test
    void createSystemActor() {
        // When
        DecisionActor actor = DecisionActor.system();

        // Then
        assertThat(actor.getType()).isEqualTo(DecisionActorType.SYSTEM);
        assertThat(actor.getMemberId()).isNull();
    }

    @DisplayName("회원 결정 주체에는 결정한 회원 ID가 있다.")
    @Test
    void createMemberActor() {
        // When
        DecisionActor actor = DecisionActor.member(1L);

        // Then
        assertThat(actor.getType()).isEqualTo(DecisionActorType.MEMBER);
        assertThat(actor.getMemberId()).isEqualTo(1L);
    }

    @DisplayName("회원 결정 주체의 회원 ID는 필수다.")
    @Test
    void memberIdIsRequiredForMemberActor() {
        // When & Then
        assertThatThrownBy(() -> DecisionActor.member(null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }
}
