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
                .body(GroupSharePreviewHtmlRenderer.render(preview));
    }
}
