package com.project.jarihana.image.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ImageUploadTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 14, 10, 0);

    @DisplayName("새 임시 업로드는 만료 전 업로더만 연결하고 프리뷰할 수 있다.")
    @Test
    void allowsTemporaryUploadOnlyForUploader() {
        ImageUpload upload = upload("groups/tmp/new.webp", 10L);

        assertThat(upload.canAttachTo(10L, 1L, NOW)).isTrue();
        assertThat(upload.canAttachTo(11L, 1L, NOW)).isFalse();
        assertThat(upload.canBePreviewedBy(10L, NOW)).isTrue();
        assertThat(upload.canBePreviewedBy(11L, NOW)).isFalse();
    }

    @DisplayName("그룹 소유가 불명확한 연결 완료 레거시 이미지는 새 그룹에 추가로 연결하지 않는다.")
    @Test
    void rejectsFurtherSharingOfAttachedLegacyUpload() {
        ImageUpload upload = upload("groups/tmp/legacy.webp", null);
        upload.completeAttachment(NOW);

        assertThat(upload.canAttachTo(10L, 2L, NOW)).isFalse();
    }

    @DisplayName("최종 경로로 이동한 이미지는 기존 그룹에서만 다시 연결할 수 있다.")
    @Test
    void allowsReattachmentOnlyWithinOwningGroup() {
        ImageUpload upload = upload("groups/tmp/owned.webp", 10L);
        upload.startPromotion(3L, "groups/3/owned.webp");
        upload.completeAttachment(NOW);

        assertThat(upload.canAttachTo(10L, 3L, NOW.plusHours(1))).isTrue();
        assertThat(upload.canAttachTo(10L, 4L, NOW)).isFalse();
    }

    private ImageUpload upload(String imageKey, Long uploaderId) {
        return ImageUpload.create(
                UUID.randomUUID(),
                "image.webp",
                "image/webp",
                1024,
                imageKey,
                NOW.plusMinutes(30),
                NOW,
                uploaderId
        );
    }
}
