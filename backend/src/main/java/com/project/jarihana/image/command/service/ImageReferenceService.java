package com.project.jarihana.image.command.service;

import com.project.jarihana.image.command.repository.ImageReferenceRepository;
import com.project.jarihana.image.domain.ImageReference;
import com.project.jarihana.image.domain.ImageReferenceType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ImageReferenceService {

    private final ImageReferenceRepository referenceRepository;
    private final ImageLifecycleService lifecycleService;

    public ImageReferenceService(
            ImageReferenceRepository referenceRepository,
            ImageLifecycleService lifecycleService
    ) {
        this.referenceRepository = referenceRepository;
        this.lifecycleService = lifecycleService;
    }

    @Transactional
    public void replace(
            ImageReferenceType type,
            long ownerId,
            long groupId,
            Collection<PromotedImage> images,
            LocalDateTime now
    ) {
        List<ImageReference> previous = referenceRepository.findAllByReferenceTypeAndOwnerId(type, ownerId);
        Set<UUID> nextIds = images.stream().map(PromotedImage::uploadId).collect(Collectors.toSet());
        referenceRepository.deleteAll(previous);
        referenceRepository.flush();
        images.stream()
                .map(image -> ImageReference.create(image.uploadId(), type, ownerId, groupId, now))
                .forEach(referenceRepository::save);
        previous.stream()
                .map(ImageReference::getImageUploadId)
                .distinct()
                .filter(id -> !nextIds.contains(id))
                .sorted()
                .forEach(uploadId -> lifecycleService.scheduleDeletionIfUnreferenced(uploadId, now));
    }

    @Transactional
    public void replaceGroup(
            long groupId,
            Collection<PromotedImage> representativeImages,
            Collection<PromotedImage> descriptionImages,
            LocalDateTime now
    ) {
        List<ImageReference> previous = referenceRepository.findAllByGroupId(groupId).stream()
                .filter(reference -> reference.getReferenceType() == ImageReferenceType.GROUP_REPRESENTATIVE
                        || reference.getReferenceType() == ImageReferenceType.GROUP_DESCRIPTION)
                .toList();
        Set<UUID> nextIds = java.util.stream.Stream.concat(
                        representativeImages.stream(),
                        descriptionImages.stream()
                )
                .map(PromotedImage::uploadId)
                .collect(Collectors.toSet());
        referenceRepository.deleteAll(previous);
        referenceRepository.flush();
        saveAll(ImageReferenceType.GROUP_REPRESENTATIVE, groupId, groupId, representativeImages, now);
        saveAll(ImageReferenceType.GROUP_DESCRIPTION, groupId, groupId, descriptionImages, now);
        previous.stream()
                .map(ImageReference::getImageUploadId)
                .distinct()
                .filter(id -> !nextIds.contains(id))
                .sorted()
                .forEach(uploadId -> lifecycleService.scheduleDeletionIfUnreferenced(uploadId, now));
    }

    @Transactional
    public void removeGroup(long groupId, LocalDateTime now) {
        remove(referenceRepository.findAllByGroupId(groupId), now);
        referenceRepository.deleteAllByGroupId(groupId);
    }

    @Transactional
    public void removeActivityPost(long postId, LocalDateTime now) {
        List<ImageReference> references = referenceRepository.findAllByReferenceTypeAndOwnerId(
                ImageReferenceType.ACTIVITY_POST,
                postId
        );
        remove(references, now);
        referenceRepository.deleteAllByReferenceTypeAndOwnerId(ImageReferenceType.ACTIVITY_POST, postId);
    }

    private void remove(List<ImageReference> references, LocalDateTime now) {
        referenceRepository.deleteAll(references);
        referenceRepository.flush();
        references.stream()
                .map(ImageReference::getImageUploadId)
                .distinct()
                .sorted()
                .forEach(uploadId -> lifecycleService.scheduleDeletionIfUnreferenced(uploadId, now));
    }

    private void saveAll(
            ImageReferenceType type,
            long ownerId,
            long groupId,
            Collection<PromotedImage> images,
            LocalDateTime now
    ) {
        images.stream()
                .map(image -> ImageReference.create(image.uploadId(), type, ownerId, groupId, now))
                .forEach(referenceRepository::save);
    }
}
