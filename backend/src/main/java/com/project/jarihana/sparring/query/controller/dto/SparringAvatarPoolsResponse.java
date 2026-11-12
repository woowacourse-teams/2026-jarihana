package com.project.jarihana.sparring.query.controller.dto;

import com.project.jarihana.member.query.controller.dto.MemberAvatarResponse.AppearanceResponse;
import com.project.jarihana.sparring.query.service.dto.SparringAvatarPoolsResult;

import java.util.List;

public record SparringAvatarPoolsResponse(List<AppearanceResponse> mint, List<AppearanceResponse> coral) {
    public static SparringAvatarPoolsResponse from(SparringAvatarPoolsResult result) {
        return new SparringAvatarPoolsResponse(
                result.mint().stream().map(AppearanceResponse::from).toList(),
                result.coral().stream().map(AppearanceResponse::from).toList());
    }
}
