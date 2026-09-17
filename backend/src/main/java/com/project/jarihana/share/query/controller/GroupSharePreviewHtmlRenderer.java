package com.project.jarihana.share.query.controller;

import com.project.jarihana.share.query.service.dto.GroupSharePreview;
import org.springframework.web.util.HtmlUtils;

final class GroupSharePreviewHtmlRenderer {

    private GroupSharePreviewHtmlRenderer() {
    }

    static String render(GroupSharePreview preview) {
        String title = escape(preview.title());
        String description = escape(preview.description());
        String canonicalUrl = escape(preview.canonicalUrl());
        String imageUrl = escape(preview.imageUrl());
        String redirectUrl = escape(preview.redirectUrl());
        return GroupSharePreviewHtmlTemplate.render(
                title,
                description,
                canonicalUrl,
                imageUrl,
                redirectUrl
        );
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value);
    }
}
