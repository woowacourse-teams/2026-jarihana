package com.project.jarihana.registration.command.repository;

import com.project.jarihana.registration.domain.Registration;
import org.springframework.data.repository.Repository;

public interface RegistrationCommandRepository extends Repository<Registration, Long> {

    void deleteAllByRecruitment_Group_Id(Long groupId);
}
