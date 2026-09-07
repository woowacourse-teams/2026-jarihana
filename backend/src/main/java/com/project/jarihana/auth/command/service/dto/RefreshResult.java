package com.project.jarihana.auth.command.service.dto;

import com.project.jarihana.auth.token.IssuedAccessToken;

public record RefreshResult(IssuedAccessToken accessToken) {
}
