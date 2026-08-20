package com.project.jarihana.auth.command.service.dto;

public record LogoutCommand(Long memberId, String signupGithubId, String refreshTokenValue) {
}
