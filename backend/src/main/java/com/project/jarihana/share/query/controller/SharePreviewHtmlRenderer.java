package com.project.jarihana.share.query.controller;

import com.project.jarihana.share.query.service.dto.SharePreviewResult;
import org.springframework.web.util.HtmlUtils;

final class SharePreviewHtmlRenderer {

    private SharePreviewHtmlRenderer() {
    }

    static String render(SharePreviewResult preview) {
        String title = escape(preview.title());
        String description = escape(preview.description());
        String canonicalUrl = escape(preview.canonicalUrl());
        String imageUrl = escape(preview.imageUrl());
        String redirectUrl = escape(preview.redirectUrl());
        String linkText = escape(preview.linkText());
        return SharePreviewHtmlTemplate.render(
                title,
                description,
                canonicalUrl,
                imageUrl,
                redirectUrl,
                linkText
        );
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value);
    }
}
