package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.query.repository.dto.GroupListPage;
import com.project.jarihana.group.query.repository.dto.GroupListSearchCriteria;
import com.project.jarihana.group.query.repository.dto.HomeGroupPages;

import java.time.LocalDate;
import java.time.LocalDateTime;

public interface GroupListRepository {

    GroupListPage findPage(GroupListSearchCriteria criteria, int size);

    HomeGroupPages findHomePages(LocalDate sessionDate, LocalDateTime now);
}
