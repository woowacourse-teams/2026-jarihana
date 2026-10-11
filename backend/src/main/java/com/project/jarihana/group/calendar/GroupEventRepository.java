package com.project.jarihana.group.calendar;

import com.project.jarihana.group.domain.GroupEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface GroupEventRepository extends JpaRepository<GroupEvent, Long> {

    List<GroupEvent> findAllByGroupIdAndDeletedAtIsNullAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAscIdAsc(
            Long groupId, LocalDate to, LocalDate from);

    Optional<GroupEvent> findByIdAndGroupIdAndDeletedAtIsNull(Long id, Long groupId);

    void deleteAllByGroupId(Long groupId);
}
