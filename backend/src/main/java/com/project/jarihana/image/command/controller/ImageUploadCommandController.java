package com.project.jarihana.image.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.image.command.controller.dto.CreateImageUploadRequest;
import com.project.jarihana.image.command.controller.dto.CreateImageUploadResponse;
import com.project.jarihana.image.command.service.ImageUploadCommandService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/image-uploads")
public class ImageUploadCommandController {

    private final ImageUploadCommandService imageUploadCommandService;

    public ImageUploadCommandController(ImageUploadCommandService imageUploadCommandService) {
        this.imageUploadCommandService = imageUploadCommandService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CreateImageUploadResponse>> createImageUpload(
            @LoginMember Long memberId,
            @Valid @RequestBody CreateImageUploadRequest request
    ) {
        CreateImageUploadResponse response = CreateImageUploadResponse.from(
                imageUploadCommandService.createImageUpload(memberId, request.toCommand())
        );
        return ResponseEntity.created(URI.create("/api/image-uploads/" + response.id()))
                .body(ApiResponse.success(response));
    }
}
