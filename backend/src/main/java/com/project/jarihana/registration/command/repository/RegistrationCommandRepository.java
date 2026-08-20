package com.project.jarihana.registration.command.repository;

import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.RegistrationStatus;
import java.util.List;
import org.springframework.data.repository.Repository;

public interface RegistrationCommandRepository extends Repository<Registration, Long> {

    void deleteAllByRecruitment_Group_Id(Long groupId);

    List<Registration> findAllByRecruitment_Group_IdAndStatus(Long groupId, RegistrationStatus status);

    Registration save(Registration registration);
}
