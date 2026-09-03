package com.project.jarihana.member.query.repository;

import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.query.repository.dto.MemberProfileProjection;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface MemberQueryRepository extends Repository<Member, Long> {

    @Query("""
            select new com.project.jarihana.member.query.repository.dto.MemberProfileProjection(
                m.id, m.crewName, m.generation, m.memberType, m.course, m.githubId
            )
            from Member m
            where m.id = :memberId
            """)
    Optional<MemberProfileProjection> findProfileById(@Param("memberId") Long memberId);
}
