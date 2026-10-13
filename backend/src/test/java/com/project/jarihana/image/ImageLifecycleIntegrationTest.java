package com.project.jarihana.image;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

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
}
