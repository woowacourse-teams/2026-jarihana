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

public interface RegistrationListJpaRepository extends JpaRepository<Registration, Long> {

    @EntityGraph(attributePaths = "member")
    @Query("""
            select registration
            from Registration registration
            where registration.recruitment.id = :recruitmentId
              and (cast(:status as String) is null or registration.status = :status)
              and (
                  cast(:cursorRegisteredAt as LocalDateTime) is null
                  or registration.registeredAt < :cursorRegisteredAt
                  or (registration.registeredAt = :cursorRegisteredAt and registration.id < :cursorId)
              )
            order by registration.registeredAt desc, registration.id desc
            """)
    Slice<Registration> findPage(
            @Param("recruitmentId") Long recruitmentId,
            @Param("status") RegistrationStatus status,
            @Param("cursorRegisteredAt") LocalDateTime cursorRegisteredAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @EntityGraph(attributePaths = {"recruitment", "recruitment.group"})
    @Query("""
            select registration
            from Registration registration
            where registration.member.id = :memberId
              and (cast(:status as String) is null or registration.status = :status)
              and (
                  cast(:cursorRegisteredAt as LocalDateTime) is null
                  or registration.registeredAt < :cursorRegisteredAt
                  or (registration.registeredAt = :cursorRegisteredAt and registration.id < :cursorId)
              )
            order by registration.registeredAt desc, registration.id desc
            """)
    Slice<Registration> findMyPage(
            @Param("memberId") Long memberId,
            @Param("status") RegistrationStatus status,
            @Param("cursorRegisteredAt") LocalDateTime cursorRegisteredAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );
}
