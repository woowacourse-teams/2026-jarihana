package com.project.jarihana.sparring.query.service.dto;

import com.project.jarihana.member.domain.AvatarAppearance;

import java.util.List;

public record SparringAvatarPoolsResult(List<AvatarAppearance> mint, List<AvatarAppearance> coral) {
    public SparringAvatarPoolsResult {
        mint = List.copyOf(mint);
        coral = List.copyOf(coral);
    }
}
