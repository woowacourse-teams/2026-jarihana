package com.project.jarihana.image.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.image.client.ImageKeyPolicy;
import com.project.jarihana.image.client.ImageObjectMetadata;
import com.project.jarihana.image.client.ImageStorage;
import com.project.jarihana.image.client.ImageStorageException;
import com.project.jarihana.image.command.repository.ImageDeletionTaskRepository;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImagePromotionTaskRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.image.domain.ImageDeletionTask;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.image.domain.ImagePromotionTask;
import java.time.LocalDateTime;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ImageLifecycleService {

    private static final String IMAGE_NOT_FOUND_MESSAGE = "이미지를 찾을 수 없습니다.";

    private final ImageUploadCommandRepository imageUploadRepository;
    private final ImageReferenceRepository imageReferenceRepository;
    private final ImageDeletionTaskRepository deletionTaskRepository;
    private final ImagePromotionTaskRepository promotionTaskRepository;
    private final ImageStorage imageStorage;
    private final ImageProperties properties;
    private final TransactionTemplate requiresNew;

    public ImageLifecycleService(
            ImageUploadCommandRepository imageUploadRepository,
            ImageReferenceRepository imageReferenceRepository,
            ImageDeletionTaskRepository deletionTaskRepository,
            ImagePromotionTaskRepository promotionTaskRepository,
            ImageStorage imageStorage,
            ImageProperties properties,
            PlatformTransactionManager transactionManager
    ) {
        this.imageUploadRepository = imageUploadRepository;
        this.imageReferenceRepository = imageReferenceRepository;
        this.deletionTaskRepository = deletionTaskRepository;
        this.promotionTaskRepository = promotionTaskRepository;
        this.imageStorage = imageStorage;
        this.properties = properties;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional
    public PromotedImage promote(Long memberId, long groupId, String imageKey, LocalDateTime now) {
        if (!ImageKeyPolicy.isManaged(imageKey)) {
            throw notFound();
        }
        ImageUpload upload = imageUploadRepository.findWithLockByImageKey(imageKey)
                .orElseThrow(ImageLifecycleService::notFound);
        if (!upload.canAttachTo(memberId, groupId, now)) {
            throw notFound();
        }
        validateObject(upload, imageKey);

        String previousKey = upload.getImageKey();
        if (ImageKeyPolicy.isTemporary(previousKey)) {
            String targetKey = ImageKeyPolicy.finalKey(groupId, previousKey);
            requiresNew.executeWithoutResult(ignored -> recordPromotionIntent(
                    upload.getId(),
                    previousKey,
                    targetKey,
                    now
            ));
            try {
                imageStorage.copy(previousKey, targetKey);
            } catch (ImageStorageException exception) {
                throw new BusinessException(ErrorCode.IMAGE_NOT_FOUND, "이미지를 최종 경로로 이동할 수 없습니다.", exception);
            }
            upload.startPromotion(groupId, targetKey);
            validateObject(upload, targetKey);
        }
        upload.completeAttachment(now);
        cancelDeletion(upload);
        return new PromotedImage(upload.getId(), previousKey, upload.getImageKey());
    }

    private void recordPromotionIntent(
            java.util.UUID uploadId,
            String sourceKey,
            String targetKey,
            LocalDateTime now
    ) {
        deletionTaskRepository.findByImageKey(targetKey).ifPresent(deletionTaskRepository::delete);
        ImagePromotionTask existing = promotionTaskRepository.findByImageUploadId(uploadId).orElse(null);
        if (existing == null) {
            promotionTaskRepository.save(ImagePromotionTask.create(
                    uploadId,
                    sourceKey,
                    targetKey,
                    now.plus(properties.cleanupLease()),
                    now
            ));
        } else if (!existing.getTargetImageKey().equals(targetKey)) {
            scheduleObjectDeletion(
                    null,
                    existing.getTargetImageKey(),
                    now.plus(properties.cleanupGracePeriod()),
                    now
            );
            existing.retarget(sourceKey, targetKey, now.plus(properties.cleanupLease()));
        }
    }

    @Transactional
    public PromotedImage preserveExistingReference(String imageKey, LocalDateTime now) {
        ImageUpload upload = imageUploadRepository.findWithLockByImageKey(imageKey)
                .orElseThrow(ImageLifecycleService::notFound);
        upload.attachLegacyAt(now);
        cancelDeletion(upload);
        return new PromotedImage(upload.getId(), imageKey, imageKey);
    }

    @Transactional
    public void scheduleDeletionIfUnreferenced(ImageUpload upload, LocalDateTime now) {
        if (upload == null || imageReferenceRepository.existsByImageUploadId(upload.getId())) {
            if (upload != null) {
                upload.restoreAttachment(now);
                cancelDeletion(upload);
            }
            return;
        }
        LocalDateTime executeAfter = now.plus(properties.cleanupGracePeriod());
        upload.requestDeletion(now, executeAfter);
        scheduleObjectDeletion(upload.getId(), upload.getImageKey(), executeAfter, now);
        if (upload.getSourceImageKey() != null && !upload.getSourceImageKey().equals(upload.getImageKey())) {
            scheduleObjectDeletion(null, upload.getSourceImageKey(), executeAfter, now);
        }
    }

    private void scheduleObjectDeletion(
            java.util.UUID uploadId,
            String imageKey,
            LocalDateTime executeAfter,
            LocalDateTime now
    ) {
        ImageDeletionTask task = deletionTaskRepository.findByImageKey(imageKey).orElse(null);
        if (task == null) {
            deletionTaskRepository.save(ImageDeletionTask.create(uploadId, imageKey, executeAfter, now));
        } else {
            task.restore(executeAfter);
        }
    }

    private void cancelDeletion(ImageUpload upload) {
        deletionTaskRepository.findByImageUploadId(upload.getId()).ifPresent(deletionTaskRepository::delete);
    }

    private void validateObject(ImageUpload upload, String imageKey) {
        try {
            ImageObjectMetadata metadata = imageStorage.metadata(imageKey);
            if (metadata == null
                    || metadata.contentLength() != upload.getFileSize()
                    || !Objects.equals(metadata.contentType(), upload.getContentType())) {
                throw notFound();
            }
        } catch (ImageStorageException exception) {
            throw new BusinessException(ErrorCode.IMAGE_NOT_FOUND, "이미지를 확인할 수 없습니다.", exception);
        }
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.IMAGE_NOT_FOUND, IMAGE_NOT_FOUND_MESSAGE);
    }
}
