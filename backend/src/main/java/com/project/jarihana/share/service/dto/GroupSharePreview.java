package com.project.jarihana.share.service.dto;

public record GroupSharePreview(
        String title,
        String description,
        String canonicalUrl,
        String imageUrl,
        String redirectUrl
) {

    public GroupSharePreview {
        if (title == null || description == null || canonicalUrl == null || imageUrl == null || redirectUrl == null) {
            throw new IllegalArgumentException("그룹 공유 미리보기 정보가 올바르지 않습니다.");
        }
    }
}
