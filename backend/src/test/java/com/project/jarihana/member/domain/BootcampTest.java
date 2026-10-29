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

class BootcampTest {

    @DisplayName("캠프 이름과 기수의 앞뒤 공백을 지우고 빈 기수는 입력하지 않은 것으로 본다.")
    @Test
    void trimNameAndTreatBlankCohortAsAbsent() {
        // When
        Bootcamp bootcamp = Bootcamp.of("  항해99 ", BootcampStatus.COMPLETED, "   ");

        // Then
        assertThat(bootcamp.getName()).isEqualTo("항해99");
        assertThat(bootcamp.getStatus()).isEqualTo(BootcampStatus.COMPLETED);
        assertThat(bootcamp.getCohort()).isNull();
    }

    @DisplayName("캠프 이름은 비어 있거나 30자를 넘을 수 없다.")
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "  ", "가나다라마바사아자차가나다라마바사아자차가나다라마바사아자차가"})
    void invalidNameCannotCreateBootcamp(String name) {
        // When & Then
        assertThatThrownBy(() -> Bootcamp.of(name, BootcampStatus.IN_PROGRESS, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("우아한테크코스는 부트캠프로 가입하지 않고 크루 인증으로만 가입한다.")
    @ParameterizedTest
    @ValueSource(strings = {"우아한테크코스", " 우아한 테크코스 ", "우테코"})
    void woowahanTechCourseCannotBeBootcamp(String name) {
        // When & Then
        assertThatThrownBy(() -> Bootcamp.of(name, BootcampStatus.IN_PROGRESS, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("수강 상태는 필수다.")
    @Test
    void statusIsRequired() {
        // When & Then
        assertThatThrownBy(() -> Bootcamp.of("SSAFY", null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }

    @DisplayName("기수는 20자를 넘을 수 없다.")
    @Test
    void cohortCannotExceedTwentyCharacters() {
        // When & Then
        assertThatThrownBy(() -> Bootcamp.of("SSAFY", BootcampStatus.IN_PROGRESS, "가".repeat(21)))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PARAMETER);
    }
}
