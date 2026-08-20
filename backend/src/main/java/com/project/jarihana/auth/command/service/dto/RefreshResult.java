package com.project.jarihana.auth.command.service.dto;

import com.project.jarihana.common.auth.IssuedAccessToken;

public record RefreshResult(IssuedAccessToken accessToken) {
}
