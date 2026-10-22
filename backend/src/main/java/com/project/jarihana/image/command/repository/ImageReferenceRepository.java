package com.project.jarihana.image.command.repository;

import com.project.jarihana.image.domain.ImageReference;
import com.project.jarihana.image.domain.ImageReferenceType;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ImageReferenceRepository extends JpaRepository<ImageReference, Long> {

    boolean existsByImageUploadId(UUID imageUploadId);

    List<ImageReference> findAllByReferenceTypeAndOwnerId(ImageReferenceType type, Long ownerId);

    List<ImageReference> findAllByGroupId(Long groupId);

    void deleteAllByReferenceTypeAndOwnerId(ImageReferenceType type, Long ownerId);

    void deleteAllByGroupId(Long groupId);
}
