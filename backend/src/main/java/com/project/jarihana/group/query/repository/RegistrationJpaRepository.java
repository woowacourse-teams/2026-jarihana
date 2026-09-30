package com.project.jarihana.group.query.repository;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RegistrationJpaRepository extends JpaRepository<Registration, Long> {

    @Query("""
            select registration.recruitment.id as recruitmentId,
                   count(registration) as approvedCount
            from Registration registration
            where registration.recruitment.id in :recruitmentIds
              and registration.status = :status
            group by registration.recruitment.id
            """)
    List<ApprovedRegistrationCount> countByRecruitmentIdsAndStatus(
            @Param("recruitmentIds") List<Long> recruitmentIds,
            @Param("status") RegistrationStatus status
    );

    @Query("""
            select registration.id as id,
                   registration.status as status
            from Registration registration
            where registration.recruitment.id = :recruitmentId
              and registration.member.id = :memberId
            """)
    Optional<CurrentMemberRegistration> findByRecruitmentIdAndMemberId(
            @Param("recruitmentId") Long recruitmentId,
            @Param("memberId") Long memberId
    );

    interface CurrentMemberRegistration {

        Long getId();

        RegistrationStatus getStatus();
    }

    interface ApprovedRegistrationCount {

        Long getRecruitmentId();

        long getApprovedCount();
    }
}
