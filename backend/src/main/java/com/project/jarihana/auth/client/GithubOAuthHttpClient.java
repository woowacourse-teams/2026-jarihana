package com.project.jarihana.auth.client;

import com.project.jarihana.auth.client.dto.GithubAccessTokenResponse;
import com.project.jarihana.auth.client.dto.GithubUserResponse;
import com.project.jarihana.auth.config.GithubOAuthProperties;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.function.Supplier;

@Component
public class GithubOAuthHttpClient implements GithubOAuthClient {

    private static final String PROVIDER_ERROR_MESSAGE = "GitHub 로그인 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final RestClient restClient;
    private final GithubOAuthProperties githubOAuthProperties;

    public GithubOAuthHttpClient(GithubOAuthProperties githubOAuthProperties) {
        this.restClient = RestClient.builder()
                .requestFactory(createRequestFactory())
                .requestInterceptor(new GithubHttpLoggingInterceptor())
                .build();
        this.githubOAuthProperties = githubOAuthProperties;
    }

    private SimpleClientHttpRequestFactory createRequestFactory() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return requestFactory;
    }

    @Override
    public String getGithubId(String authorizationCode) {
        String accessToken = requestAccessToken(authorizationCode);
        return requestGithubId(accessToken);
    }

    private String requestAccessToken(String authorizationCode) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", githubOAuthProperties.clientId());
        form.add("client_secret", githubOAuthProperties.clientSecret());
        form.add("code", authorizationCode);
        form.add("redirect_uri", githubOAuthProperties.redirectUri());

        GithubAccessTokenResponse response = request(() -> restClient.post()
                .uri(githubOAuthProperties.tokenUri())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .accept(MediaType.APPLICATION_JSON)
                .body(form)
                .retrieve()
                .body(GithubAccessTokenResponse.class));

        if (response == null || response.accessToken() == null || response.accessToken().isBlank()) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_ERROR, PROVIDER_ERROR_MESSAGE);
        }
        return response.accessToken();
    }

    private <T> T request(Supplier<T> call) {
        try {
            return call.get();
        } catch (RestClientException exception) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_ERROR, PROVIDER_ERROR_MESSAGE, exception);
        }
    }

    private String requestGithubId(String accessToken) {
        GithubUserResponse response = request(() -> restClient.get()
                .uri(githubOAuthProperties.userUri())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(GithubUserResponse.class));

        if (response == null || response.id() == null) {
            throw new BusinessException(ErrorCode.OAUTH_PROVIDER_ERROR, PROVIDER_ERROR_MESSAGE);
        }
        return String.valueOf(response.id());
    }
}
