package com.project.jarihana.common.exception;

import com.project.jarihana.common.response.ApiResponse;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @DisplayName("동시에 들어온 가입이 회원 닉네임 유일 제약에 걸리면 닉네임 중복으로 응답한다.")
    @ParameterizedTest
    @ValueSource(strings = {"uk_member_crew_name_generation", "uk_member_coach_name", "uk_member_non_crew_name"})
    void respondMemberNameConstraintAsDuplicatedName(String constraintName) {
        // Given
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "duplicated member name",
                new ConstraintViolationException("duplicated member name", new SQLException(), constraintName)
        );

        // When
        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().error().code()).isEqualTo(ErrorCode.MEMBER_CREW_DUPLICATED.name());
    }
}
