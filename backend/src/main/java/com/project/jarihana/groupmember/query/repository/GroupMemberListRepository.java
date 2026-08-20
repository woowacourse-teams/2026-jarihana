package com.project.jarihana.groupmember.query.repository;

import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListPage;
import com.project.jarihana.groupmember.query.repository.dto.GroupMemberListSearchCriteria;

public interface GroupMemberListRepository {

    boolean existsGroupById(Long groupId);

    GroupMemberListPage findPage(GroupMemberListSearchCriteria criteria, int size);
}
