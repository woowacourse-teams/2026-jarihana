package com.project.jarihana.registration.query.repository;

import com.project.jarihana.registration.query.repository.dto.RegistrationListPage;
import com.project.jarihana.registration.query.repository.dto.RegistrationListSearchCriteria;
import java.util.Optional;

public interface RegistrationListRepository {

    Optional<Long> findGroupIdByRecruitmentId(Long recruitmentId);

    boolean existsLeaderByGroupIdAndMemberId(Long groupId, Long memberId);

    RegistrationListPage findPage(RegistrationListSearchCriteria criteria, int size);
}
