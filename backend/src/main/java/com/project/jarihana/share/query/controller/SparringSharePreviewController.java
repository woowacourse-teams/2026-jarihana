package com.project.jarihana.share.query.controller;

import com.project.jarihana.share.query.service.SparringSharePreviewService;
import com.project.jarihana.share.query.service.dto.SharePreviewResult;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/share/sparrings")
@RequiredArgsConstructor
public class SparringSharePreviewController {

    private final SparringSharePreviewService sparringSharePreviewService;

    @GetMapping(value = "/{topicId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> findSparringPreview(@PathVariable long topicId) {
        SharePreviewResult preview = sparringSharePreviewService.findSparringPreview(topicId);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(SharePreviewHtmlRenderer.render(preview));
    }
}
