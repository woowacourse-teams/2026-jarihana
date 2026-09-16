package com.project.jarihana.share.query.controller;

import com.project.jarihana.share.query.service.GroupSharePreviewService;
import com.project.jarihana.share.query.service.dto.GroupSharePreview;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

import java.time.Duration;

@RestController
@RequestMapping("/share")
public class GroupSharePreviewController {

    private final GroupSharePreviewService groupSharePreviewService;

    public GroupSharePreviewController(GroupSharePreviewService groupSharePreviewService) {
        this.groupSharePreviewService = groupSharePreviewService;
    }

    @GetMapping(value = "/groups/{groupId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> findGroupPreview(@PathVariable long groupId) {
        GroupSharePreview preview = groupSharePreviewService.findGroupPreview(groupId);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(render(preview));
    }

    private static String render(GroupSharePreview preview) {
        String title = escape(preview.title());
        String description = escape(preview.description());
        String canonicalUrl = escape(preview.canonicalUrl());
        String imageUrl = escape(preview.imageUrl());
        String redirectUrl = escape(preview.redirectUrl());
        return """
                <!doctype html>
                <html lang="ko">
                  <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>%s</title>
                    <meta name="description" content="%s">
                    <link rel="canonical" href="%s">
                    <meta property="og:type" content="website">
                    <meta property="og:site_name" content="자리하나">
                    <meta property="og:locale" content="ko_KR">
                    <meta property="og:title" content="%s">
                    <meta property="og:description" content="%s">
                    <meta property="og:url" content="%s">
                    <meta property="og:image" content="%s">
                    <meta name="twitter:card" content="summary_large_image">
                    <meta name="twitter:title" content="%s">
                    <meta name="twitter:description" content="%s">
                    <meta name="twitter:image" content="%s">
                    <script>
                      window.location.replace(document.querySelector('link[rel="canonical"]').href + "?preview=1");
                    </script>
                  </head>
                  <body>
                    <noscript><p><a href="%s">모임 페이지로 이동</a></p></noscript>
                  </body>
                </html>
                """.formatted(
                title,
                description,
                canonicalUrl,
                title,
                description,
                canonicalUrl,
                imageUrl,
                title,
                description,
                imageUrl,
                redirectUrl
        );
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value);
    }
}
