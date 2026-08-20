package com.project.jarihana.registration.command.repository;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.util.List;
import org.springframework.data.repository.Repository;

public interface RegistrationCommandRepository extends Repository<Registration, Long> {

    void deleteAllByRecruitmentGroupId(long groupId);

    List<Registration> findAllByRecruitmentGroupIdAndStatus(long groupId, RegistrationStatus status);

    List<Registration> findAllByRecruitmentIdInAndStatus(
            List<Long> recruitmentIds,
            RegistrationStatus status
    );

    Registration save(Registration registration);
}
