package com.project.jarihana.member.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyTest {

    @DisplayName("회사명의 앞뒤 공백을 지우고 공개 여부와 함께 저장한다.")
    @Test
    void trimNameAndKeepVisibility() {
        // When
        Company company = Company.of(" 자리하나 ", true);

        // Then
        assertThat(company.getName()).isEqualTo("자리하나");
        assertThat(company.isVisible()).isTrue();
    }

    @DisplayName("회사명은 비어 있거나 50자를 넘을 수 없다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   "})
    void blankNameCannotCreateCompany(String name) {
        // When & Then
        assertThatThrownBy(() -> Company.of(name, true))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("회사명은 50자를 넘을 수 없다.")
    @Test
    void nameCannotExceedFiftyCharacters() {
        // When & Then
        assertThatThrownBy(() -> Company.of("가".repeat(51), false))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }
}
