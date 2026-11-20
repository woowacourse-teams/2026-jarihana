package com.project.jarihana.sparring.query.service.dto;

import com.project.jarihana.member.domain.AvatarAppearance;

import java.util.List;

public record SparringAvatarPoolsResult(List<AvatarAppearance> appearances) {
    public SparringAvatarPoolsResult {
        appearances = List.copyOf(appearances);
    }
}
