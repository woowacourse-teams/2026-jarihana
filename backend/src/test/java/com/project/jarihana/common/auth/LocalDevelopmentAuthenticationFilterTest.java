package com.project.jarihana.common.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class LocalDevelopmentAuthenticationFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authenticatesConfiguredMemberForExplicitLoopbackRequest() throws Exception {
        LocalDevelopmentAuthenticationFilter filter = new LocalDevelopmentAuthenticationFilter(1L);
        MockHttpServletRequest request = localRequest();
        request.addHeader(LocalDevelopmentAuthenticationFilter.HEADER_NAME, "enabled");
        AtomicBoolean continued = new AtomicBoolean();

        filter.doFilter(request, new MockHttpServletResponse(), (ignoredRequest, ignoredResponse) ->
                continued.set(true)
        );

        assertThat(continued).isTrue();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isEqualTo(1L);
    }

    @Test
    void ignoresMissingHeaderAndNonLoopbackRequests() throws Exception {
        LocalDevelopmentAuthenticationFilter filter = new LocalDevelopmentAuthenticationFilter(1L);
        MockHttpServletRequest missingHeader = localRequest();

        filter.doFilter(missingHeader, new MockHttpServletResponse(), (request, response) -> {});

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();

        MockHttpServletRequest remoteRequest = new MockHttpServletRequest();
        remoteRequest.setRemoteAddr("192.0.2.10");
        remoteRequest.addHeader(LocalDevelopmentAuthenticationFilter.HEADER_NAME, "enabled");

        filter.doFilter(remoteRequest, new MockHttpServletResponse(), (request, response) -> {});

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void preservesAnExistingJwtAuthentication() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(7L, null, List.of())
        );
        LocalDevelopmentAuthenticationFilter filter = new LocalDevelopmentAuthenticationFilter(1L);
        MockHttpServletRequest request = localRequest();
        request.addHeader(LocalDevelopmentAuthenticationFilter.HEADER_NAME, "enabled");

        filter.doFilter(request, new MockHttpServletResponse(), (ignoredRequest, ignoredResponse) -> {});

        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isEqualTo(7L);
    }

    @Test
    void rejectsAnInvalidConfiguredMemberId() {
        assertThatThrownBy(() -> new LocalDevelopmentAuthenticationFilter(0L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private MockHttpServletRequest localRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        return request;
    }
}
