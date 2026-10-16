package com.project.jarihana.image.command.service;

import com.project.jarihana.image.client.ImageStorage;
import com.project.jarihana.image.command.repository.ImageDeletionTaskRepository;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImagePromotionTaskRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.image.domain.ImageDeletionTask;
import com.project.jarihana.image.domain.ImageUpload;
import com.project.jarihana.image.domain.ImagePromotionTask;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Slf4j
@Service
public class ImageCleanupService {

    private final ImageUploadCommandRepository uploadRepository;
    private final ImageReferenceRepository referenceRepository;
    private final ImageDeletionTaskRepository taskRepository;
    private final ImagePromotionTaskRepository promotionTaskRepository;
    private final ImageLifecycleService lifecycleService;
    private final ImageStorage imageStorage;
    private final ImageProperties properties;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public ImageCleanupService(
            ImageUploadCommandRepository uploadRepository,
            ImageReferenceRepository referenceRepository,
            ImageDeletionTaskRepository taskRepository,
            ImagePromotionTaskRepository promotionTaskRepository,
            ImageLifecycleService lifecycleService,
            ImageStorage imageStorage,
            ImageProperties properties,
            Clock clock,
            PlatformTransactionManager transactionManager
    ) {
        this.uploadRepository = uploadRepository;
        this.referenceRepository = referenceRepository;
        this.taskRepository = taskRepository;
        this.promotionTaskRepository = promotionTaskRepository;
        this.lifecycleService = lifecycleService;
        this.imageStorage = imageStorage;
        this.properties = properties;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public void cleanupBatch() {
        LocalDateTime now = LocalDateTime.now(clock);
        reconcilePromotions(now);
        reconcileExpiredUploads(now);
        List<UUID> taskIds = taskRepository.findDue(now, PageRequest.of(0, properties.cleanupBatchSize()))
                .stream()
                .map(ImageDeletionTask::getId)
                .toList();
        taskIds.forEach(taskId -> process(taskId, now));
    }

    private void reconcilePromotions(LocalDateTime now) {
        List<UUID> taskIds = promotionTaskRepository
                .findDue(now, PageRequest.of(0, properties.cleanupBatchSize()))
                .stream()
                .map(ImagePromotionTask::getId)
                .toList();
        taskIds.forEach(taskId -> reconcilePromotion(taskId, now));
    }

    private void reconcilePromotion(UUID taskId, LocalDateTime now) {
        ImagePromotionTask task = promotionTaskRepository.findById(taskId).orElse(null);
        if (task == null) {
            return;
        }
        try {
            ImageUpload upload = uploadRepository.findById(task.getImageUploadId()).orElse(null);
            boolean promotedToTarget = upload != null
                    && task.getTargetImageKey().equals(upload.getImageKey());
            imageStorage.delete(promotedToTarget ? task.getSourceImageKey() : task.getTargetImageKey());
            transactions.executeWithoutResult(ignored -> promotionTaskRepository.deleteById(taskId));
        } catch (RuntimeException exception) {
            String error = exception.getClass().getSimpleName();
            transactions.executeWithoutResult(ignored -> promotionTaskRepository.findById(taskId)
                    .ifPresent(candidate -> candidate.retryAt(now.plusMinutes(1), error)));
            log.atWarn()
                    .addKeyValue("event.action", "image.promotion.reconcile_failed")
                    .addKeyValue("image.task_id", taskId)
                    .addKeyValue("error.type", error)
                    .log("Image promotion reconciliation will be retried");
        }
    }

    private void reconcileExpiredUploads(LocalDateTime now) {
        transactions.executeWithoutResult(ignored -> uploadRepository
                .findCleanupCandidates(now, PageRequest.of(0, properties.cleanupBatchSize()))
                .forEach(upload -> lifecycleService.scheduleDeletionIfUnreferenced(upload.getId(), now)));
    }

    private void process(UUID taskId, LocalDateTime now) {
        ClaimedTask claimed = transactions.execute(ignored -> claim(taskId, now));
        if (claimed == null) {
            return;
        }
        try {
            imageStorage.delete(claimed.imageKey());
            transactions.executeWithoutResult(ignored -> complete(claimed));
        } catch (RuntimeException exception) {
            transactions.executeWithoutResult(ignored -> retry(claimed, now, exception));
        }
    }

    private ClaimedTask claim(UUID taskId, LocalDateTime now) {
        ImageDeletionTask task = taskRepository.findWithLockById(taskId).orElse(null);
        if (task == null || !task.canClaim(now)) {
            return null;
        }
        if (task.getImageUploadId() != null && referenceRepository.existsByImageUploadId(task.getImageUploadId())) {
            uploadRepository.findById(task.getImageUploadId()).ifPresent(upload -> upload.restoreAttachment(now));
            taskRepository.delete(task);
            return null;
        }
        task.claimUntil(now.plus(properties.cleanupLease()));
        return new ClaimedTask(task.getId(), task.getImageUploadId(), task.getImageKey());
    }

    private void complete(ClaimedTask claimed) {
        ImageDeletionTask task = taskRepository.findWithLockById(claimed.taskId()).orElse(null);
        if (task == null) {
            return;
        }
        if (claimed.uploadId() != null && referenceRepository.existsByImageUploadId(claimed.uploadId())) {
            uploadRepository.findById(claimed.uploadId()).ifPresent(upload -> upload.restoreAttachment(LocalDateTime.now(clock)));
            taskRepository.delete(task);
            return;
        }
        if (claimed.uploadId() != null) {
            uploadRepository.findById(claimed.uploadId()).ifPresent(uploadRepository::delete);
        }
        taskRepository.delete(task);
    }

    private void retry(ClaimedTask claimed, LocalDateTime now, RuntimeException exception) {
        ImageDeletionTask task = taskRepository.findWithLockById(claimed.taskId()).orElse(null);
        if (task == null) {
            return;
        }
        String error = exception.getClass().getSimpleName();
        LocalDateTime retryAt = now.plusMinutes(1L << Math.min(6, retryCount(claimed.uploadId())));
        task.reschedule(retryAt, error);
        if (claimed.uploadId() != null) {
            uploadRepository.findById(claimed.uploadId())
                    .ifPresent(upload -> upload.recordCleanupFailure(retryAt, error));
        }
        log.atWarn()
                .addKeyValue("event.action", "image.cleanup.failed")
                .addKeyValue("image.task_id", claimed.taskId())
                .addKeyValue("error.type", error)
                .log("Image cleanup will be retried");
    }

    private int retryCount(UUID uploadId) {
        if (uploadId == null) {
            return 0;
        }
        return uploadRepository.findById(uploadId).map(ImageUpload::getCleanupAttempts).orElse(0);
    }

    private record ClaimedTask(UUID taskId, UUID uploadId, String imageKey) {
    }
}
