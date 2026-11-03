package com.project.jarihana.image.command.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.project.jarihana.image.client.ImageStorage;
import com.project.jarihana.image.client.ImageStorageBoundaryException;
import com.project.jarihana.image.command.repository.ImageDeletionTaskRepository;
import com.project.jarihana.image.command.repository.ImagePromotionTaskRepository;
import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.command.repository.ImageUploadCommandRepository;
import com.project.jarihana.image.config.ImageProperties;
import com.project.jarihana.image.domain.ImageDeletionTask;
import com.project.jarihana.image.domain.ImagePromotionTask;
import com.project.jarihana.image.domain.ImageUpload;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class ImageCleanupServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 3, 10, 0);
    private final ImageUploadCommandRepository uploads = mock(ImageUploadCommandRepository.class);
    private final ImageReferenceRepository references = mock(ImageReferenceRepository.class);
    private final ImageDeletionTaskRepository deletions = mock(ImageDeletionTaskRepository.class);
    private final ImagePromotionTaskRepository promotions = mock(ImagePromotionTaskRepository.class);
    private final ImageStorage storage = mock(ImageStorage.class);
    private ImageCleanupService cleanup;

    @BeforeEach
    void setUp() {
        PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        ImageProperties properties = new ImageProperties(
                "techcourse-project-2026", "ap-northeast-2", "jarihana/images",
                null, null, null, null, null, null, 0, null, true, null, null, 0, 0);
        cleanup = new ImageCleanupService(uploads, references, deletions, promotions,
                mock(ImageLifecycleService.class), storage, properties,
                Clock.fixed(NOW.toInstant(ZoneOffset.UTC), ZoneOffset.UTC), transactions);
        when(promotions.findDue(eq(NOW), any())).thenReturn(List.of());
        when(uploads.findCleanupCandidates(eq(NOW), any())).thenReturn(List.of());
        when(deletions.findDue(eq(NOW), any())).thenReturn(List.of());
    }

    @DisplayName("업로드와 다른 키 또는 형식이 잘못된 삭제 작업은 삭제하지 않고 보존한다.")
    @ParameterizedTest
    @ValueSource(strings = {"other-team/photo.jpg", "groups/9/unrelated.jpg", "groups/tmp/../photo.jpg"})
    void keepsMismatchedDeletionWithoutCallingStorage(String key) {
        // Given
        ImageUpload upload = upload("groups/3/owned.jpg");
        ImageDeletionTask task = dueDeletion(upload.getId(), key);
        when(uploads.findById(upload.getId())).thenReturn(Optional.of(upload));

        // When
        cleanup.cleanupBatch();

        // Then
        verifyNoInteractions(storage);
        verify(deletions, never()).delete(any(ImageDeletionTask.class));
        verify(uploads, never()).delete(any(ImageUpload.class));
        assertThat(task.canClaim(NOW)).isTrue();
    }

    @DisplayName("연결된 업로드가 없는 삭제 작업은 완료 처리하지 않는다.")
    @Test
    void rejectsDeletionWithMissingUpload() {
        // Given
        ImageDeletionTask task = dueDeletion(UUID.randomUUID(), "groups/3/owned.jpg");

        // When
        cleanup.cleanupBatch();

        // Then
        verifyNoInteractions(storage);
        verify(deletions, never()).delete(any(ImageDeletionTask.class));
        assertThat(task.canClaim(NOW)).isTrue();
    }

    @DisplayName("업로드 ID 없는 정상 객체 정리 작업은 처리한다.")
    @Test
    void allowsStandaloneManagedObjectDeletion() {
        // Given
        ImageDeletionTask task = dueDeletion(null, "groups/tmp/source.jpg");

        // When
        cleanup.cleanupBatch();

        // Then
        verify(storage).delete("groups/tmp/source.jpg");
        verify(deletions).delete(task);
    }

    @DisplayName("작업과 업로드의 키가 일치하는 정상 삭제는 완료한다.")
    @Test
    void completesMatchingDeletion() {
        // Given
        ImageUpload upload = upload("groups/3/owned.jpg");
        ImageDeletionTask task = dueDeletion(upload.getId(), upload.getImageKey());
        when(uploads.findById(upload.getId())).thenReturn(Optional.of(upload));

        // When
        cleanup.cleanupBatch();

        // Then
        verify(storage).delete(upload.getImageKey());
        verify(uploads).delete(upload);
        verify(deletions).delete(task);
    }

    @DisplayName("승격 복구 작업의 원본 또는 대상 키가 비정상이면 둘 다 삭제하지 않는다.")
    @ParameterizedTest
    @ValueSource(strings = {"other-team/photo.jpg", "groups/tmp/../../photo.jpg", "groups/2/photo.jpg"})
    void rejectsInvalidPromotionSource(String source) {
        // Given
        ImageUpload upload = upload("groups/3/photo.jpg");
        ImagePromotionTask task = duePromotion(upload, source, "groups/3/photo.jpg");

        // When
        cleanup.cleanupBatch();

        // Then
        verifyNoInteractions(storage);
        verify(promotions, never()).delete(any(ImagePromotionTask.class));
    }

    @DisplayName("승격 대상의 파일명이 원본과 다르면 삭제하지 않는다.")
    @Test
    void rejectsPromotionWithMismatchedFilename() {
        // Given
        ImageUpload upload = upload("groups/tmp/source.jpg");
        duePromotion(upload, upload.getImageKey(), "groups/3/unrelated.jpg");

        // When
        cleanup.cleanupBatch();

        // Then
        verifyNoInteractions(storage);
        verify(promotions, never()).delete(any(ImagePromotionTask.class));
    }

    @DisplayName("롤백된 정상 승격은 대상 객체만 정리한다.")
    @Test
    void reconcilesValidRolledBackPromotion() {
        // Given
        ImageUpload upload = upload("groups/tmp/photo.jpg");
        ImagePromotionTask task = duePromotion(upload, upload.getImageKey(), "groups/3/photo.jpg");

        // When
        cleanup.cleanupBatch();

        // Then
        verify(storage).delete("groups/3/photo.jpg");
        verify(promotions).delete(task);
    }

    @DisplayName("완료된 정상 승격은 원본 임시 객체만 정리한다.")
    @Test
    void reconcilesValidCompletedPromotion() {
        // Given
        String source = "groups/tmp/photo.jpg";
        ImageUpload upload = upload(source);
        upload.startPromotion(3L, "groups/3/photo.jpg");
        upload.completeAttachment(NOW);
        ImagePromotionTask task = duePromotion(upload, source, upload.getImageKey());

        // When
        cleanup.cleanupBatch();

        // Then
        verify(storage).delete(source);
        verify(promotions).delete(task);
    }

    @DisplayName("S3 경계 검증에서 거부된 삭제는 업로드와 작업을 완료 처리하지 않는다.")
    @Test
    void retainsTaskWhenStorageRejectsDeletion() {
        // Given
        ImageUpload upload = upload("groups/3/owned.jpg");
        ImageDeletionTask task = dueDeletion(upload.getId(), upload.getImageKey());
        when(uploads.findById(upload.getId())).thenReturn(Optional.of(upload));
        doThrow(new ImageStorageBoundaryException("rejected"))
                .when(storage).delete(upload.getImageKey());

        // When
        cleanup.cleanupBatch();

        // Then
        verify(deletions, never()).delete(any(ImageDeletionTask.class));
        verify(uploads, never()).delete(any(ImageUpload.class));
        assertThat(task.canClaim(NOW)).isFalse();
        assertThat(upload.getCleanupAttempts()).isEqualTo(1);
    }

    private ImageDeletionTask dueDeletion(UUID uploadId, String key) {
        ImageDeletionTask task = ImageDeletionTask.create(uploadId, key, NOW.minusDays(1), NOW.minusDays(8));
        when(deletions.findDue(eq(NOW), any())).thenReturn(List.of(task));
        when(deletions.findWithLockById(task.getId())).thenReturn(Optional.of(task));
        return task;
    }

    private ImagePromotionTask duePromotion(ImageUpload upload, String source, String target) {
        ImagePromotionTask task = ImagePromotionTask.create(
                upload.getId(), source, target, NOW.minusMinutes(1), NOW.minusHours(1));
        when(promotions.findDue(eq(NOW), any())).thenReturn(List.of(task));
        when(promotions.findById(task.getId())).thenReturn(Optional.of(task));
        when(uploads.findWithLockById(upload.getId())).thenReturn(Optional.of(upload));
        return task;
    }

    private ImageUpload upload(String key) {
        return ImageUpload.create(UUID.randomUUID(), "photo.jpg", "image/jpeg", 1024,
                key, NOW.minusDays(7), NOW.minusDays(8));
    }
}
