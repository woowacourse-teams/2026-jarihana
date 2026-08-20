package com.project.jarihana.auth.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GithubAccessTokenResponse(@JsonProperty("access_token") String accessToken) {
}
