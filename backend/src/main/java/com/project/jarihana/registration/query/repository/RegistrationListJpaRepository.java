package com.project.jarihana.registration.query.repository;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface RegistrationListJpaRepository extends JpaRepository<Registration, Long> {

    @EntityGraph(attributePaths = "member")
    @Query("""
            select registration
            from Registration registration
            where registration.recruitment.id = :recruitmentId
              and (cast(:status as String) is null or registration.status = :status)
              and (registration.registeredAt, registration.id) < (:cursorRegisteredAt, :cursorId)
            order by registration.registeredAt desc, registration.id desc
            """)
    Slice<Registration> findPage(
            @Param("recruitmentId") Long recruitmentId,
            @Param("status") RegistrationStatus status,
            @Param("cursorRegisteredAt") LocalDateTime cursorRegisteredAt,
            @Param("cursorId") long cursorId,
            Pageable pageable
    );

    @EntityGraph(attributePaths = {"recruitment", "recruitment.group"})
    @Query("""
            select registration
            from Registration registration
            where registration.member.id = :memberId
              and (cast(:status as String) is null or registration.status = :status)
              and (
                  registration.recruitment.group.visibility = com.project.jarihana.group.domain.GroupVisibility.PUBLIC
                  or (registration.recruitment.group.visibility = com.project.jarihana.group.domain.GroupVisibility.CREW_ONLY
                      and registration.member.memberType = com.project.jarihana.member.domain.MemberType.CREW)
                  or exists (
                      select viewerMembership.id
                      from GroupMember viewerMembership
                      where viewerMembership.group = registration.recruitment.group
                        and viewerMembership.member.id = :memberId
                  )
              )
              and (registration.registeredAt, registration.id) < (:cursorRegisteredAt, :cursorId)
            order by registration.registeredAt desc, registration.id desc
            """)
    Slice<Registration> findMyPage(
            @Param("memberId") Long memberId,
            @Param("status") RegistrationStatus status,
            @Param("cursorRegisteredAt") LocalDateTime cursorRegisteredAt,
            @Param("cursorId") long cursorId,
            Pageable pageable
    );

    @Query("""
            select count(registration)
            from Registration registration
            where registration.recruitment.group.id = :groupId
              and registration.status = com.project.jarihana.registration.domain.RegistrationStatus.PENDING
            """)
    long countPendingByGroupId(@Param("groupId") Long groupId);

    @Query("""
            select count(registration)
            from Registration registration
            where registration.recruitment.group.id = :groupId
              and registration.leaderViewedAt is null
            """)
    long countUnreadByGroupId(@Param("groupId") Long groupId);

    @Query("""
            select registration.id
            from Registration registration
            where registration.recruitment.group.id = :groupId
              and registration.leaderViewedAt is null
            order by registration.registeredAt desc, registration.id desc
            """)
    List<Long> findUnreadRegistrationIdsByGroupId(@Param("groupId") Long groupId, Pageable pageable);

    @Query("""
            select registration.recruitment.id
            from Registration registration
            where registration.recruitment.group.id = :groupId
              and registration.leaderViewedAt is null
            order by registration.registeredAt desc, registration.id desc
            """)
    List<Long> findUnreadRecruitmentIdsByGroupId(@Param("groupId") Long groupId, Pageable pageable);

    @Query("""
            select registration.recruitment.id
            from Registration registration
            where registration.recruitment.group.id = :groupId
              and registration.status = com.project.jarihana.registration.domain.RegistrationStatus.PENDING
            order by registration.registeredAt desc, registration.id desc
            """)
    List<Long> findPendingRecruitmentIdsByGroupId(@Param("groupId") Long groupId, Pageable pageable);
}
