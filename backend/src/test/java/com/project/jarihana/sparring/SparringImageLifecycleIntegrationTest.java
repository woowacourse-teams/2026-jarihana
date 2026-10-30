package com.project.jarihana.sparring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.image.command.repository.ImagePromotionTaskRepository;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.command.service.ImageCleanupService;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.image.domain.ImageUploadStatus;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.sparring.command.service.SparringCommandService;
import com.project.jarihana.sparring.command.service.dto.CreateSparringCommand;
import com.project.jarihana.support.ImageStorageStub;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class SparringImageLifecycleIntegrationTest extends IntegrationTestSupport {
    @Autowired MemberRepository members;
    @Autowired ImageUploadCommandRepository uploads;
    @Autowired ImageReferenceRepository references;
    @Autowired ImagePromotionTaskRepository promotions;
    @Autowired SparringCommandService sparrings;
    @Autowired ImageCleanupService cleanup;
    @Autowired ImageStorageStub storage;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("토론 생성 롤백 뒤에는 이동 의도를 남겨 복사된 대표사진만 회수한다")
    void recoversImagePromotionWhenTopicCreationRollsBack() {
        // Given
        var now = TestSupportConfig.FIXED_NOW;
        Member member = members.save(Member.create("사진복구", 23, "sparring-rollback", Course.BACKEND));
        String temporaryKey = "groups/tmp/" + UUID.randomUUID() + ".webp";
        ImageUpload upload = uploads.save(ImageUpload.create(UUID.randomUUID(), "cover.webp", "image/webp", 1024,
                temporaryKey, now.plusMinutes(30), now, member.getId()));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);

        // When
        assertThatThrownBy(() -> transaction.executeWithoutResult(ignored -> {
            sparrings.create(member.getId(), new CreateSparringCommand("롤백 토론", "찬성", "반대", "",
                    now.plusDays(1), temporaryKey));
            throw new IllegalStateException("rollback scenario");
        })).isInstanceOf(IllegalStateException.class).hasMessage("rollback scenario");

        // Then
        assertThat(uploads.findById(upload.getId()).orElseThrow().getStatus()).isEqualTo(ImageUploadStatus.TEMPORARY);
        assertThat(references.existsByImageUploadId(upload.getId())).isFalse();
        var promotion = promotions.findByImageUploadId(upload.getId()).orElseThrow();
        String abandonedKey = promotion.getTargetImageKey();
        assertThat(abandonedKey).startsWith("sparrings/");
        transaction.executeWithoutResult(ignored -> {
            var pending = promotions.findById(promotion.getId()).orElseThrow();
            pending.refreshReconciliation(now.minusSeconds(1));
        });

        cleanup.cleanupBatch();

        assertThat(storage.metadata(abandonedKey)).isNull();
        assertThat(storage.metadata(temporaryKey)).isNotNull();
        assertThat(promotions.findByImageUploadId(upload.getId())).isEmpty();
    }
}
