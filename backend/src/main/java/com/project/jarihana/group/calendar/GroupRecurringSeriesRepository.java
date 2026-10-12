package com.project.jarihana.group.calendar;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.time.LocalDate;

public interface GroupRecurringSeriesRepository extends JpaRepository<GroupRecurringSeries, Long> {
    List<GroupRecurringSeries> findAllByGroupIdOrderByCalendarStartDateAsc(Long groupId);

    void deleteAllByGroupId(Long groupId);

    Optional<GroupRecurringSeries> findFirstByGroupIdAndCurrentTrue(Long groupId);

    @Modifying
    @Query("update GroupRecurringSeries s set s.version = s.version + 1 where s.id = :id and s.version = :version")
    int incrementVersion(@Param("id") Long id, @Param("version") Long version);

    @Modifying
    @Query("""
            update GroupRecurringSeries s
            set s.calendarStartDate = :startDate, s.calendarEndDate = :endDate, s.version = s.version + 1
            where s.id = :id and s.version = :version
            """)
    int updateRange(@Param("id") Long id, @Param("version") Long version,
                    @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Modifying
    @Query("""
            update GroupRecurringSeries s
            set s.calendarEndDate = :endDate, s.flexibleFromDate = :flexibleFromDate,
                s.current = false, s.hideAll = :hideAll,
                s.version = s.version + 1
            where s.id = :id and s.version = :version
            """)
    int stop(@Param("id") Long id, @Param("version") Long version,
             @Param("endDate") LocalDate endDate, @Param("hideAll") boolean hideAll,
             @Param("flexibleFromDate") LocalDate flexibleFromDate);

    @Modifying
    @Query("""
            update GroupRecurringSeries s
            set s.current = false, s.hideAll = true, s.flexibleFromDate = :flexibleFromDate,
                s.version = s.version + 1
            where s.group.id = :groupId and s.id <> :currentSeriesId and s.hideAll = false
            """)
    int hideOtherSeries(@Param("groupId") Long groupId, @Param("currentSeriesId") Long currentSeriesId,
                        @Param("flexibleFromDate") LocalDate flexibleFromDate);
}
