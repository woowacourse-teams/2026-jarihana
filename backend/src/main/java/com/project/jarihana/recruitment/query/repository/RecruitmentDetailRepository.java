package com.project.jarihana.recruitment.query.repository;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.recruitment.query.repository.dto.RecruitmentDetailProjection;

import java.util.Optional;

public interface RecruitmentDetailRepository {

    Optional<Group> findGroupById(Long groupId);

    Optional<RecruitmentDetailProjection> findByGroupIdAndRecruitmentId(Long groupId, Long recruitmentId);
}
