package com.project.jarihana.groupspace.query.repository;

import com.project.jarihana.group.domain.Group;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface GroupSpaceQueryRepository extends Repository<Group, Long> {
    @Query("""
            select new com.project.jarihana.groupspace.query.repository.GroupSpaceProjection(
                s.roomJson, s.revision, s.updatedAt, g.type, g.status, m.role)
            from Group g
            left join GroupMember m on m.group.id = g.id and m.member.id = :memberId
            left join GroupSpace s on s.group.id = g.id
            where g.id = :groupId
            """)
    Optional<GroupSpaceProjection> findSpace(@Param("groupId") long groupId, @Param("memberId") Long memberId);
}
