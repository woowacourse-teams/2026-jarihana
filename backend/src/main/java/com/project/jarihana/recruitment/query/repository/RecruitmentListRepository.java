package com.project.jarihana.recruitment.query.repository;

import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListPage;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentListSearchCriteria;

public interface RecruitmentListRepository {

    boolean existsGroupById(Long groupId);

    RecruitmentListPage findPage(RecruitmentListSearchCriteria criteria, int size);
}
