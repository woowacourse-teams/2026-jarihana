package com.project.jarihana.share.query.controller;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class SharePreviewHtmlTemplate {

    private static final String TEMPLATE_PATH = "/share/share-preview.html";
    private static final String CONTENT = loadContent();

    private SharePreviewHtmlTemplate() {
    }

    static String render(
            String title,
            String description,
            String canonicalUrl,
            String imageUrl,
            String redirectUrl,
            String linkText
    ) {
        return CONTENT.formatted(title, description, canonicalUrl, imageUrl, redirectUrl, linkText);
    }

    private static String loadContent() {
        try (InputStream inputStream = SharePreviewHtmlTemplate.class.getResourceAsStream(TEMPLATE_PATH)) {
            if (inputStream == null) {
                throw new IllegalStateException("공유 미리보기 HTML 템플릿을 찾을 수 없습니다.");
            }
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "공유 미리보기 HTML 템플릿을 읽을 수 없습니다.",
                    exception
            );
        }
    }
}
