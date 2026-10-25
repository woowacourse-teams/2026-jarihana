package com.project.jarihana.image.query.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.image.domain.ImageUpload;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ImageAccessServiceTest {

    @DisplayName("기본 공개 주소를 사용할 때 API 이미지 경로에 /api를 중복해서 붙이지 않는다.")
    @Test
    void rewritesApiImagePathWithoutDuplicatingApiPrefix() {
        ImageAccessService service = new ImageAccessService(
                mock(ImageUploadCommandRepository.class),
                mock(ImageReferenceRepository.class),
                properties(),
                mock(CloudFrontUrlSigner.class),
                Clock.system(ZoneOffset.UTC)
        );
        String markdown = "![소개](/api/images/groups/12/intro.webp)";

        assertThat(service.rewriteMarkdown(markdown))
                .isEqualTo("![소개](/api/images/groups/12/intro.webp)");
    }

    @DisplayName("임시 프리뷰 서명 URL은 5분과 업로드 만료 시각 중 빠른 시각에 만료된다.")
    @Test
    void capsTemporaryPreviewUrlAtFiveMinutesAndUploadExpiration() {
        Instant now = Instant.parse("2026-10-19T10:00:00Z");
        String longLivedKey = "groups/tmp/long-lived.webp";
        String shortLivedKey = "groups/tmp/short-lived.webp";
        ImageUpload longLivedUpload = upload(longLivedKey, LocalDateTime.of(2026, 10, 19, 10, 30));
        ImageUpload shortLivedUpload = upload(shortLivedKey, LocalDateTime.of(2026, 10, 19, 10, 3));
        ImageUploadCommandRepository uploadRepository = mock(ImageUploadCommandRepository.class);
        ImageReferenceRepository referenceRepository = mock(ImageReferenceRepository.class);
        CloudFrontUrlSigner signer = mock(CloudFrontUrlSigner.class);
        when(uploadRepository.findByImageKey(longLivedKey)).thenReturn(Optional.of(longLivedUpload));
        when(uploadRepository.findByImageKey(shortLivedKey)).thenReturn(Optional.of(shortLivedUpload));
        when(referenceRepository.existsByImageUploadId(longLivedUpload.getId())).thenReturn(false);
        when(referenceRepository.existsByImageUploadId(shortLivedUpload.getId())).thenReturn(false);
        when(signer.sign(anyString(), any(Instant.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ImageAccessService service = new ImageAccessService(
                uploadRepository,
                referenceRepository,
                properties("https://service.example.test/images", Duration.ofMinutes(5)),
                signer,
                Clock.fixed(now, ZoneOffset.UTC)
        );

        assertThat(service.issueDeliveryUrl(longLivedKey, 42L))
                .isEqualTo("https://service.example.test/images/" + longLivedKey);
        assertThat(service.issueDeliveryUrl(shortLivedKey, 42L))
                .isEqualTo("https://service.example.test/images/" + shortLivedKey);

        verify(signer).sign(
                "https://service.example.test/images/" + longLivedKey,
                now.plus(Duration.ofMinutes(5))
        );
        verify(signer).sign(
                "https://service.example.test/images/" + shortLivedKey,
                now.plus(Duration.ofMinutes(3))
        );
    }

    private ImageProperties properties() {
        return properties("", Duration.ofMinutes(5));
    }

    private ImageProperties properties(String deliveryBaseUrl, Duration accessUrlExpiration) {
        return new ImageProperties(
                "bucket",
                "ap-northeast-2",
                "jarihana/images",
                "",
                deliveryBaseUrl,
                "",
                "",
                null,
                accessUrlExpiration,
                0,
                null,
                false,
                null,
                null,
                0,
                0
        );
    }

    private ImageUpload upload(String imageKey, LocalDateTime expiresAt) {
        return ImageUpload.create(
                UUID.randomUUID(),
                "preview.webp",
                "image/webp",
                1024,
                imageKey,
                expiresAt,
                LocalDateTime.of(2026, 10, 19, 9, 0),
                42L
        );
    }
}
