package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListProjection;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;

public interface GroupListRepository {

    GroupListPage findPage(GroupListSearchCriteria criteria, int size);
}
