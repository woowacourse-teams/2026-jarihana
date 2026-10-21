package com.project.jarihana.image.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.image.client.ImageKeyPolicy;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.image.domain.ImageUpload;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ImageAccessService {

    private static final Pattern STORED_IMAGE_URL = Pattern.compile(
            "(?:https?://[^\\s)]+)?/?(?:api/)?images/(groups/(?:tmp|[1-9][0-9]*)/"
                    + "[A-Za-z0-9][A-Za-z0-9._-]{0,199}\\.(?:jpg|png|webp))"
    );

    private final ImageUploadCommandRepository uploadRepository;
    private final ImageReferenceRepository referenceRepository;
    private final ImageProperties properties;
    private final CloudFrontUrlSigner signer;
    private final Clock clock;

    public ImageAccessService(
            ImageUploadCommandRepository uploadRepository,
            ImageReferenceRepository referenceRepository,
            ImageProperties properties,
            CloudFrontUrlSigner signer,
            Clock clock
    ) {
        this.uploadRepository = uploadRepository;
        this.referenceRepository = referenceRepository;
        this.properties = properties;
        this.signer = signer;
        this.clock = clock;
    }

    public String publicUrl(String imageKey) {
        if (imageKey == null || ImageKeyPolicy.DEFAULT_IMAGE_KEY.equals(imageKey)) {
            return ImageKeyPolicy.DEFAULT_IMAGE_KEY;
        }
        String baseUrl = properties.publicBaseUrl();
        if (baseUrl.isBlank()) {
            return "/api/images/" + imageKey;
        }
        return trimSlash(baseUrl) + "/" + trimLeadingSlash(imageKey);
    }

    public String rewriteMarkdown(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return markdown;
        }
        Matcher matcher = STORED_IMAGE_URL.matcher(markdown);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(result, Matcher.quoteReplacement(publicUrl(matcher.group(1))));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    @Transactional(readOnly = true)
    public String issueDeliveryUrl(String imageKey, Long memberId) {
        if (!ImageKeyPolicy.isManaged(imageKey)) {
            throw notFound();
        }
        ImageUpload upload = uploadRepository.findByImageKey(imageKey).orElseThrow(ImageAccessService::notFound);
        LocalDateTime now = LocalDateTime.now(clock);
        Instant expiresAt;
        if (referenceRepository.existsByImageUploadId(upload.getId())) {
            expiresAt = now.plus(properties.accessUrlExpiration())
                    .atZone(clock.getZone())
                    .toInstant();
        } else if (upload.canBePreviewedBy(memberId, now)) {
            LocalDateTime previewExpiresAt = now.plus(properties.accessUrlExpiration());
            LocalDateTime uploadExpiresAt = upload.getExpiresAt();
            if (uploadExpiresAt.isBefore(previewExpiresAt)) {
                previewExpiresAt = uploadExpiresAt;
            }
            expiresAt = previewExpiresAt.atZone(clock.getZone()).toInstant();
        } else {
            throw notFound();
        }
        String deliveryBaseUrl = properties.deliveryBaseUrl();
        if (deliveryBaseUrl.isBlank()) {
            throw new BusinessException(ErrorCode.IMAGE_NOT_FOUND, "이미지 전달 경로가 설정되지 않았습니다.");
        }
        String resourceUrl = trimSlash(deliveryBaseUrl) + "/" + trimLeadingSlash(imageKey);
        return signer.sign(resourceUrl, expiresAt);
    }

    private static String trimSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private static String trimLeadingSlash(String value) {
        return value.replaceFirst("^/+", "");
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.IMAGE_NOT_FOUND, "이미지를 찾을 수 없습니다.");
    }
}
