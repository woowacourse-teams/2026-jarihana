package com.project.jarihana.activitypost.query.repository;

import com.project.jarihana.activitypost.domain.ActivityPostComment;
import com.project.jarihana.activitypost.query.repository.dto.ActivityPostCommentProjection;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ActivityPostCommentQueryRepository extends JpaRepository<ActivityPostComment, Long> {

    @Query("""
            select new com.project.jarihana.activitypost.query.repository.dto.ActivityPostCommentProjection(
                comment.id,
                author.crewName,
                comment.content,
                comment.createdAt,
                case when :memberId is not null and (
                    author.id = :memberId or exists (
                        select leader.id from GroupMember leader
                        where leader.group.id = post.group.id
                          and leader.member.id = :memberId
                          and leader.role = com.project.jarihana.groupmember.domain.GroupMemberRole.LEADER
                    )
                ) then true else false end
            )
            from ActivityPostComment comment
            join comment.author author
            join comment.post post
            where post.id = :postId
              and comment.deletedAt is null
              and (
                  cast(:cursorCreatedAt as LocalDateTime) is null
                  or comment.createdAt > :cursorCreatedAt
                  or (comment.createdAt = :cursorCreatedAt and comment.id > :cursorId)
              )
            order by comment.createdAt asc, comment.id asc
            """)
    List<ActivityPostCommentProjection> findPage(
            @Param("postId") long postId,
            @Param("memberId") Long memberId,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );
}
