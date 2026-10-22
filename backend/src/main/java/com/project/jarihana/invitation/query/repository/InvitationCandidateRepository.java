package com.project.jarihana.invitation.query.repository;

import com.project.jarihana.invitation.query.repository.dto.InvitationCandidateProjection;
import com.project.jarihana.member.domain.Member;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface InvitationCandidateRepository extends Repository<Member, Long> {

    @Query("""
            select new com.project.jarihana.invitation.query.repository.dto.InvitationCandidateProjection(
                m.id, m.crewName, m.githubId, m.generation, m.memberType, m.course, m.createdAt)
            from Member m
            where m.withdrawnAt is null and m.id <> :memberId and (:keyword = '' or locate(:keyword, m.crewName) > 0)
              and not exists (select gm.id from GroupMember gm where gm.group.id = :groupId and gm.member.id = m.id)
              and (cast(:createdAt as timestamp) is null or m.createdAt < :createdAt or (m.createdAt = :createdAt and m.id < :id))
            order by m.createdAt desc, m.id desc
            """)
    Slice<InvitationCandidateProjection> findCandidates(@Param("groupId") long groupId, @Param("memberId") long memberId,
            @Param("keyword") String keyword, @Param("createdAt") LocalDateTime createdAt, @Param("id") Long id,
            Pageable pageable);
}
