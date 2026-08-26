package com.project.jarihana.image.command.repository;

import com.project.jarihana.image.domain.ImageUpload;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

public interface ImageUploadCommandRepository extends Repository<ImageUpload, UUID> {

    ImageUpload save(ImageUpload imageUpload);

    Optional<ImageUpload> findByImageKey(String imageKey);
}
