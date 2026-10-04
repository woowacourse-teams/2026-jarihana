package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostPhoto;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityPostPhotoCommandRepository extends JpaRepository<ActivityPostPhoto, Long> {

    Optional<ActivityPostPhoto> findByPostId(long postId);

    Optional<ActivityPostPhoto> findByImageKey(String imageKey);
}
