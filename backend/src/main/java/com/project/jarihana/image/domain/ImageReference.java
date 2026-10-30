package com.project.jarihana.image.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "image_reference",
        indexes = {
                @Index(name = "idx_image_reference_upload", columnList = "image_upload_id"),
                @Index(name = "idx_image_reference_group", columnList = "group_id")
        },
        uniqueConstraints = @UniqueConstraint(
                name = "uk_image_reference_owner_upload",
                columnNames = {"reference_type", "owner_id", "image_upload_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ImageReference extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "image_upload_id", nullable = false)
    private UUID imageUploadId;

    @Enumerated(EnumType.STRING)
    @Column(name = "reference_type", nullable = false, length = 32)
    private ImageReferenceType referenceType;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "group_id")
    private Long groupId;

    private ImageReference(
            UUID imageUploadId,
            ImageReferenceType referenceType,
            Long ownerId,
            Long groupId,
            LocalDateTime createdAt
    ) {
        super(createdAt);
        this.imageUploadId = imageUploadId;
        this.referenceType = referenceType;
        this.ownerId = ownerId;
        this.groupId = groupId;
    }

    public static ImageReference create(
            UUID imageUploadId,
            ImageReferenceType referenceType,
            Long ownerId,
            Long groupId,
            LocalDateTime createdAt
    ) {
        return new ImageReference(imageUploadId, referenceType, ownerId, groupId, createdAt);
    }

    public UUID getImageUploadId() {
        return imageUploadId;
    }

    public ImageReferenceType getReferenceType() {
        return referenceType;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public Long getGroupId() {
        return groupId;
    }
}
