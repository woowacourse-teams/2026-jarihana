package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostComment;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityPostCommentCommandRepository extends JpaRepository<ActivityPostComment, Long> {

    Optional<ActivityPostComment> findByIdAndDeletedAtIsNullAndPostDeletedAtIsNull(long id);
}
