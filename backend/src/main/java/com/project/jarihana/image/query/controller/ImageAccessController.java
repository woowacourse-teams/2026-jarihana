package com.project.jarihana.image.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.image.query.service.ImageAccessService;
import java.net.URI;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/images")
public class ImageAccessController {

    private final ImageAccessService imageAccessService;
    private final LoginMemberReader loginMemberReader;

    public ImageAccessController(ImageAccessService imageAccessService, LoginMemberReader loginMemberReader) {
        this.imageAccessService = imageAccessService;
        this.loginMemberReader = loginMemberReader;
    }

    @GetMapping("/{*imageKey}")
    public ResponseEntity<Void> redirect(@PathVariable String imageKey) {
        String location = imageAccessService.issueDeliveryUrl(
                imageKey.replaceFirst("^/+", ""),
                loginMemberReader.currentMemberId().orElse(null)
        );
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .location(URI.create(location))
                .build();
    }
}
