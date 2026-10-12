package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPost;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityPostCommandRepository extends JpaRepository<ActivityPost, Long> {

    Optional<ActivityPost> findByIdAndDeletedAtIsNull(long id);

    List<ActivityPost> findAllByGroupIdAndDeletedAtIsNull(long groupId);
}
