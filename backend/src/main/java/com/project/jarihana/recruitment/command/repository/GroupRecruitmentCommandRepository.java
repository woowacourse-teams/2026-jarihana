package com.project.jarihana.recruitment.command.repository;

import com.project.jarihana.recruitment.domain.GroupRecruitment;
import org.springframework.data.repository.Repository;

public interface GroupRecruitmentCommandRepository extends Repository<GroupRecruitment, Long> {

    void deleteAllByGroup_Id(Long groupId);
}
