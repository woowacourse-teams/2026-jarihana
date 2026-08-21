package com.project.jarihana.common.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class LoginMemberArgumentResolverTest {

    private static final long MEMBER_ID = 12L;

    private final LoginMemberArgumentResolver resolver = new LoginMemberArgumentResolver(new LoginMemberReader());

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @DisplayName("@LoginMember가 붙은 Long 파라미터를 지원한다.")
    @Test
    void supportAnnotatedLongParameter() {
        // Given
        MethodParameter parameter = parameterOf("annotated");

        // When
        boolean supported = resolver.supportsParameter(parameter);

        // Then
        assertThat(supported).isTrue();
    }

    @DisplayName("@LoginMember가 붙은 long 파라미터를 지원한다.")
    @Test
    void supportAnnotatedPrimitiveLongParameter() {
        // Given
        MethodParameter parameter = parameterOf("annotatedPrimitiveLong");

        // When
        boolean supported = resolver.supportsParameter(parameter);

        // Then
        assertThat(supported).isTrue();
    }

    @DisplayName("@LoginMember가 없는 파라미터는 지원하지 않는다.")
    @Test
    void notSupportParameterWithoutAnnotation() {
        // Given
        MethodParameter parameter = parameterOf("notAnnotated");

        // When
        boolean supported = resolver.supportsParameter(parameter);

        // Then
        assertThat(supported).isFalse();
    }

    @DisplayName("@LoginMember가 붙어도 Long이 아닌 파라미터는 지원하지 않는다.")
    @Test
    void notSupportAnnotatedNonLongParameter() {
        // Given
        MethodParameter parameter = parameterOf("annotatedString");

        // When
        boolean supported = resolver.supportsParameter(parameter);

        // Then
        assertThat(supported).isFalse();
    }

    @DisplayName("인증된 요청에서는 회원 식별자를 돌려준다.")
    @Test
    void resolveAuthenticatedMemberId() {
        // Given
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(MEMBER_ID, null, List.of()));

        // When
        Object resolved = resolver.resolveArgument(parameterOf("annotated"), null, null, null);

        // Then
        assertThat(resolved).isEqualTo(MEMBER_ID);
    }

    @DisplayName("인증되지 않은 요청은 거부한다.")
    @Test
    void rejectUnauthenticatedRequest() {
        // Given
        MethodParameter parameter = parameterOf("annotated");

        // When

        // Then
        assertThatThrownBy(() -> resolver.resolveArgument(parameter, null, null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
    }

    private MethodParameter parameterOf(String methodName) {
        Method method = Arrays.stream(Handler.class.getDeclaredMethods())
                .filter(candidate -> candidate.getName().equals(methodName))
                .findFirst()
                .orElseThrow();
        return new MethodParameter(method, 0);
    }

    @SuppressWarnings("unused")
    private static final class Handler {

        void annotated(@LoginMember Long memberId) {
        }

        void annotatedPrimitiveLong(@LoginMember long memberId) {
        }

        void notAnnotated(Long memberId) {
        }

        void annotatedString(@LoginMember String memberId) {
        }
    }
}
