package com.project.jarihana.group.calendar;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GroupRecurringPeriodRepository extends JpaRepository<GroupRecurringPeriod, Long> {
    List<GroupRecurringPeriod> findAllBySeriesIdOrderByEffectiveFromAsc(Long seriesId);

    void deleteAllBySeriesId(Long seriesId);
}
