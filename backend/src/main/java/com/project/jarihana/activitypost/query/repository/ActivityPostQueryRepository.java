package com.project.jarihana.activitypost.query.repository;

import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.query.repository.dto.ActivityPostProjection;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ActivityPostQueryRepository extends JpaRepository<ActivityPost, Long> {

    @Query("""
            select new com.project.jarihana.activitypost.query.repository.dto.ActivityPostProjection(
                post.id,
                activityGroup.id,
                activityGroup.name,
                activityGroup.type,
                activityGroup.status,
                author.crewName,
                photo.imageKey,
                post.caption,
                post.activityDate,
                post.createdAt,
                case when :memberId is not null and (
                    author.id = :memberId or exists (
                        select groupMember.id from GroupMember groupMember
                        where groupMember.group.id = activityGroup.id
                          and groupMember.member.id = :memberId
                          and groupMember.role = com.project.jarihana.groupmember.domain.GroupMemberRole.LEADER
                    )
                ) then true else false end
            )
            from ActivityPost post
            join post.group activityGroup
            join post.author author
            join ActivityPostPhoto photo on photo.post.id = post.id
            where post.deletedAt is null
              and (:groupId is null or activityGroup.id = :groupId)
              and (:onlyMine = false or author.id = :memberId)
              and (
                  cast(:cursorDate as LocalDate) is null
                  or post.activityDate < :cursorDate
                  or (post.activityDate = :cursorDate and post.id < :cursorId)
              )
            order by post.activityDate desc, post.id desc
            """)
    List<ActivityPostProjection> findPage(
            @Param("groupId") Long groupId,
            @Param("onlyMine") boolean onlyMine,
            @Param("memberId") Long memberId,
            @Param("cursorDate") LocalDate cursorDate,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );
}
