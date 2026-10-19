package com.project.jarihana.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.image.command.repository.ImageDeletionTaskRepository;
import com.project.jarihana.image.command.repository.ImagePromotionTaskRepository;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.command.service.ImageCleanupService;
import com.project.jarihana.image.command.service.ImageLifecycleService;
import com.project.jarihana.image.command.service.ImageReferenceService;
import com.project.jarihana.image.command.service.PromotedImage;
import com.project.jarihana.image.domain.ImageDeletionTask;
import com.project.jarihana.image.domain.ImagePromotionTask;
import com.project.jarihana.image.domain.ImageReference;
import com.project.jarihana.image.domain.ImageReferenceType;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.image.domain.ImageUploadStatus;
import com.project.jarihana.support.ImageStorageStub;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class ImageLifecycleIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private GroupCommandRepository groupRepository;

    @Autowired
    private ImageUploadCommandRepository uploadRepository;

    @Autowired
    private ImageReferenceRepository referenceRepository;

    @Autowired
    private ImageDeletionTaskRepository deletionTaskRepository;

    @Autowired
    private ImagePromotionTaskRepository promotionTaskRepository;

    @Autowired
    private ImageReferenceService referenceService;

    @Autowired
    private ImageLifecycleService lifecycleService;

    @Autowired
    private ImageCleanupService cleanupService;

    @Autowired
    private ImageStorageStub imageStorage;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @DisplayName("마지막 참조가 사라진 이미지는 7일 뒤 삭제하도록 예약한다.")
    @Test
    void schedulesDeletionAfterGracePeriod() {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        ImageUpload upload = attachedUpload("groups/3/activity.webp", null);
        referenceRepository.save(ImageReference.create(
                upload.getId(), ImageReferenceType.ACTIVITY_POST, 91L, 3L, now));

        referenceService.removeActivityPost(91L, now);

        ImageDeletionTask task = deletionTaskRepository.findByImageUploadId(upload.getId()).orElseThrow();
        assertThat(task.getExecuteAfter()).isEqualTo(now.plusDays(7));
        assertThat(uploadRepository.findById(upload.getId()).orElseThrow().getStatus())
                .isEqualTo(ImageUploadStatus.DELETE_PENDING);
    }

    @DisplayName("이동을 마친 이미지의 참조가 사라져도 복구 작업은 최종 객체를 유예 전에 삭제하지 않는다.")
    @Test
    void keepsPromotedTargetUntilDeletionGracePeriod() {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        String sourceKey = "groups/tmp/promoted.webp";
        String targetKey = "groups/7/promoted.webp";
        ImageUpload upload = attachedUpload(targetKey, sourceKey);
        promotionTaskRepository.save(ImagePromotionTask.create(
                upload.getId(), sourceKey, targetKey, now.minusSeconds(1), now.minusMinutes(20)));
        deletionTaskRepository.save(ImageDeletionTask.create(
                upload.getId(), targetKey, now.plusDays(7), now));

        cleanupService.cleanupBatch();

        assertThat(imageStorage.metadata(sourceKey)).isNull();
        assertThat(imageStorage.metadata(targetKey)).isNotNull();
        assertThat(promotionTaskRepository.findByImageUploadId(upload.getId())).isEmpty();
        assertThat(deletionTaskRepository.findByImageUploadId(upload.getId())).isPresent();
    }

    @DisplayName("롤백된 이동을 다른 그룹 경로로 재시도하면 이동 의도와 이전 대상 정리를 함께 갱신한다.")
    @Test
    void retargetsPromotionIntentAfterRetry() {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        String sourceKey = "groups/tmp/retry.webp";
        String abandonedTarget = "groups/8/retry.webp";
        long groupId = createGroup();
        String nextTarget = "groups/" + groupId + "/retry.webp";
        ImageUpload upload = uploadRepository.save(ImageUpload.create(
                UUID.randomUUID(), "retry.webp", "image/webp", 1024,
                sourceKey, now.plusMinutes(30), now
        ));
        promotionTaskRepository.save(ImagePromotionTask.create(
                upload.getId(), sourceKey, abandonedTarget, now.plusMinutes(15), now));
        deletionTaskRepository.save(ImageDeletionTask.create(
                null, nextTarget, now.plusDays(1), now.minusDays(6)));

        lifecycleService.promote(null, groupId, sourceKey, now);

        ImagePromotionTask task = promotionTaskRepository.findByImageUploadId(upload.getId()).orElseThrow();
        assertThat(task.getSourceImageKey()).isEqualTo(sourceKey);
        assertThat(task.getTargetImageKey()).isEqualTo(nextTarget);
        ImageDeletionTask abandoned = deletionTaskRepository.findByImageKey(abandonedTarget).orElseThrow();
        assertThat(abandoned.getExecuteAfter()).isEqualTo(now.plusDays(7));
        assertThat(deletionTaskRepository.findByImageKey(nextTarget)).isEmpty();
    }

    @DisplayName("같은 그룹으로 승격을 재시도하면 복구 작업의 유예 시각을 다시 설정한다.")
    @Test
    void refreshesPromotionReconciliationLeaseOnSameGroupRetry() {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        long groupId = createGroup();
        String sourceKey = "groups/tmp/same-group-retry.webp";
        String targetKey = "groups/" + groupId + "/same-group-retry.webp";
        ImageUpload upload = uploadRepository.save(ImageUpload.create(
                UUID.randomUUID(), "same-group-retry.webp", "image/webp", 1024,
                sourceKey, now.plusMinutes(30), now
        ));
        promotionTaskRepository.save(ImagePromotionTask.create(
                upload.getId(), sourceKey, targetKey, now.minusSeconds(1), now.minusMinutes(20)));

        lifecycleService.promote(null, groupId, sourceKey, now);

        assertThat(promotionTaskRepository.findByImageUploadId(upload.getId())).isPresent();
        assertThat(promotionTaskRepository.findDue(now.plusMinutes(1), PageRequest.of(0, 100)))
                .isEmpty();
    }

    @DisplayName("승격과 복구 작업이 겹치면 복구 작업은 승격 트랜잭션이 끝날 때까지 기다린다.")
    @Test
    void promotionReconciliationWaitsForConcurrentPromotion() throws Exception {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        long groupId = createGroup();
        String sourceKey = "groups/tmp/concurrent-retry.webp";
        String targetKey = "groups/" + groupId + "/concurrent-retry.webp";
        ImageUpload upload = uploadRepository.save(ImageUpload.create(
                UUID.randomUUID(), "concurrent-retry.webp", "image/webp", 1024,
                sourceKey, now.plusMinutes(30), now.minusMinutes(30)
        ));
        promotionTaskRepository.save(ImagePromotionTask.create(
                upload.getId(), sourceKey, targetKey, now.minusSeconds(1), now.minusMinutes(20)));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch promotionLocked = new CountDownLatch(1);
        CountDownLatch cleanupRequested = new CountDownLatch(1);
        CountDownLatch allowPromotionCommit = new CountDownLatch(1);

        try {
            Future<?> promotion = executor.submit(() -> transaction.executeWithoutResult(ignored -> {
                ImageUpload locked = uploadRepository.findWithLockById(upload.getId()).orElseThrow();
                promotionLocked.countDown();
                await(allowPromotionCommit);
                locked.startPromotion(groupId, targetKey);
                locked.completeAttachment(now);
            }));
            assertThat(promotionLocked.await(3, TimeUnit.SECONDS)).isTrue();

            Future<?> cleanup = executor.submit(() -> {
                cleanupRequested.countDown();
                cleanupService.cleanupBatch();
            });
            assertThat(cleanupRequested.await(3, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> cleanup.get(300, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);

            allowPromotionCommit.countDown();
            promotion.get(3, TimeUnit.SECONDS);
            cleanup.get(3, TimeUnit.SECONDS);

            ImageUpload persisted = uploadRepository.findById(upload.getId()).orElseThrow();
            assertThat(persisted.getStatus()).isEqualTo(ImageUploadStatus.ATTACHED);
            assertThat(persisted.getImageKey()).isEqualTo(targetKey);
            assertThat(imageStorage.metadata(targetKey)).isNotNull();
            assertThat(imageStorage.metadata(sourceKey)).isNull();
            assertThat(promotionTaskRepository.findByImageUploadId(upload.getId())).isEmpty();
        } finally {
            allowPromotionCommit.countDown();
            executor.shutdownNow();
        }
    }

    @DisplayName("같은 이미지를 대표에서 소개로 옮겨도 삭제 대상으로 예약하지 않는다.")
    @Test
    void replacesGroupReferencesAsOneSet() {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        ImageUpload upload = attachedUpload("groups/5/shared.webp", null);
        referenceRepository.save(ImageReference.create(
                upload.getId(), ImageReferenceType.GROUP_REPRESENTATIVE, 5L, 5L, now));
        PromotedImage image = new PromotedImage(
                upload.getId(), upload.getImageKey(), upload.getImageKey());

        referenceService.replaceGroup(5L, List.of(), List.of(image), now);

        assertThat(referenceRepository.findAllByGroupId(5L))
                .singleElement()
                .extracting(ImageReference::getReferenceType)
                .isEqualTo(ImageReferenceType.GROUP_DESCRIPTION);
        assertThat(deletionTaskRepository.findByImageUploadId(upload.getId())).isEmpty();
        assertThat(uploadRepository.findById(upload.getId()).orElseThrow().getStatus())
                .isEqualTo(ImageUploadStatus.ATTACHED);
    }

    @DisplayName("만료 정리와 이미지 승격이 겹쳐도 승격된 이미지를 삭제 대상으로 덮어쓰지 않는다.")
    @Test
    void cleanupWaitsForConcurrentPromotion() throws Exception {
        // Given
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        long groupId = createGroup();
        String sourceKey = "groups/tmp/concurrent.webp";
        String targetKey = "groups/" + groupId + "/concurrent.webp";
        ImageUpload upload = uploadRepository.save(ImageUpload.create(
                UUID.randomUUID(), "concurrent.webp", "image/webp", 1024,
                sourceKey, now, now.minusMinutes(30)
        ));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch promotionLocked = new CountDownLatch(1);
        CountDownLatch cleanupRequested = new CountDownLatch(1);
        CountDownLatch allowPromotionCommit = new CountDownLatch(1);

        try {
            Future<?> promotion = executor.submit(() -> transaction.executeWithoutResult(ignored -> {
                ImageUpload locked = uploadRepository.findWithLockById(upload.getId()).orElseThrow();
                promotionLocked.countDown();
                await(allowPromotionCommit);
                locked.startPromotion(groupId, targetKey);
                locked.completeAttachment(now);
            }));
            assertThat(promotionLocked.await(3, TimeUnit.SECONDS)).isTrue();

            // When
            Future<?> cleanup = executor.submit(() -> {
                cleanupRequested.countDown();
                cleanupService.cleanupBatch();
            });
            assertThat(cleanupRequested.await(3, TimeUnit.SECONDS)).isTrue();

            // Then
            assertThatThrownBy(() -> cleanup.get(300, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);

            allowPromotionCommit.countDown();
            promotion.get(3, TimeUnit.SECONDS);
            cleanup.get(3, TimeUnit.SECONDS);

            ImageUpload persisted = uploadRepository.findById(upload.getId()).orElseThrow();
            assertThat(persisted.getStatus()).isEqualTo(ImageUploadStatus.ATTACHED);
            assertThat(persisted.getImageKey()).isEqualTo(targetKey);
            assertThat(deletionTaskRepository.findByImageUploadId(upload.getId())).isEmpty();
        } finally {
            allowPromotionCommit.countDown();
            executor.shutdownNow();
        }
    }

    private ImageUpload attachedUpload(String imageKey, String sourceKey) {
        LocalDateTime now = TestSupportConfig.FIXED_NOW;
        ImageUpload upload = ImageUpload.create(
                UUID.randomUUID(),
                "image.webp",
                "image/webp",
                1024,
                sourceKey == null ? imageKey : sourceKey,
                now.plusMinutes(30),
                now
        );
        if (sourceKey != null) {
            upload.startPromotion(createGroup(), imageKey);
        }
        upload.completeAttachment(now);
        return uploadRepository.save(upload);
    }

    private long createGroup() {
        return groupRepository.save(Group.createStudy(
                "이미지 수명주기 테스트 그룹",
                "테스트 소개",
                null,
                null,
                RecurringGroupSchedule.of(Set.of(DayOfWeek.MONDAY), LocalTime.NOON, LocalTime.of(13, 0)),
                TestSupportConfig.FIXED_NOW
        )).getId();
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(3, TimeUnit.SECONDS)) {
                throw new IllegalStateException("이미지 수명주기 동시성 테스트 대기 시간이 초과되었습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("이미지 수명주기 동시성 테스트가 중단되었습니다.", exception);
        }
    }
}
