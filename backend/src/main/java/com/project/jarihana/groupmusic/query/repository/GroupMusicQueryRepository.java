package com.project.jarihana.groupmusic.query.repository;

import com.project.jarihana.group.domain.Group;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface GroupMusicQueryRepository extends Repository<Group, Long> {
    @Query("""
            select new com.project.jarihana.groupmusic.query.repository.GroupMusicProjection(
                s.musicJson, s.revision, s.updatedAt, g.status, m.role,
                s.playbackState, s.playlistIndex, s.positionSeconds, s.anchorTime, s.playbackRevision)
            from Group g
            left join GroupMember m on m.group.id = g.id and m.member.id = :memberId
            left join GroupMusic s on s.group.id = g.id
            where g.id = :groupId
            """)
    Optional<GroupMusicProjection> findMusic(@Param("groupId") long groupId, @Param("memberId") Long memberId);
}
