package com.project.jarihana.group.query.repository;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    interface ApprovedRegistrationCount {

        Long getRecruitmentId();

        long getApprovedCount();
    }
}
