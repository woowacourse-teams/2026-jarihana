package com.project.jarihana.image.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.image.client.ImageStorage;
import com.project.jarihana.image.client.ImageStorageException;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.command.service.dto.CreateImageUploadCommand;
import com.project.jarihana.image.command.service.dto.CreateImageUploadResult;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.member.command.repository.MemberRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ImageUploadCommandService {

    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp"
    );

    private final MemberRepository memberRepository;
    private final ImageUploadCommandRepository imageUploadCommandRepository;
    private final ImageStorage imageStorage;
    private final ImageProperties imageProperties;
    private final Clock clock;

    public ImageUploadCommandService(
            MemberRepository memberRepository,
            ImageUploadCommandRepository imageUploadCommandRepository,
            ImageStorage imageStorage,
            ImageProperties imageProperties,
            Clock clock
    ) {
        this.memberRepository = memberRepository;
        this.imageUploadCommandRepository = imageUploadCommandRepository;
        this.imageStorage = imageStorage;
        this.imageProperties = imageProperties;
        this.clock = clock;
    }

    public CreateImageUploadResult createImageUpload(Long memberId, CreateImageUploadCommand command) {
        memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        validateContentType(command.contentType());
        validateFileSize(command.fileSize());

        UUID id = UUID.randomUUID();
        String imageKey = "groups/tmp/" + id + "." + EXTENSIONS.get(command.contentType());
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime expiresAt = now.plus(imageProperties.presignedUrlExpiration());
        String uploadUrl;
        try {
            uploadUrl = imageStorage.issueUploadUrl(
                    imageKey, command.contentType(), imageProperties.presignedUrlExpiration());
        } catch (ImageStorageException exception) {
            throw new BusinessException(
                    ErrorCode.IMAGE_UPLOAD_URL_ISSUE_FAILED,
                    "이미지 업로드 URL을 발급할 수 없습니다."
            );
        }
        imageUploadCommandRepository.save(ImageUpload.create(
                id,
                command.fileName(),
                command.contentType(),
                command.fileSize(),
                imageKey,
                expiresAt,
                now
        ));
        return new CreateImageUploadResult(id, imageKey, uploadUrl, expiresAt);
    }

    private void validateContentType(String contentType) {
        if (!imageProperties.allowedContentTypes().contains(contentType) || !EXTENSIONS.containsKey(contentType)) {
            throw new BusinessException(ErrorCode.IMAGE_CONTENT_TYPE_NOT_ALLOWED, "허용하지 않는 이미지 형식입니다.");
        }
    }

    private void validateFileSize(long fileSize) {
        if (fileSize > imageProperties.maxFileSize()) {
            throw new BusinessException(ErrorCode.IMAGE_FILE_TOO_LARGE, "이미지 파일 크기가 제한을 초과했습니다.");
        }
    }
}
