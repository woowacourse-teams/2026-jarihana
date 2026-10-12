package com.project.jarihana.group.calendar;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GroupLocationHistoryRepository extends JpaRepository<GroupLocationHistory, Long> {
    List<GroupLocationHistory> findAllByGroupIdOrderByEffectiveFromAtAscIdAsc(Long groupId);
    Optional<GroupLocationHistory> findFirstByGroupIdAndEffectiveUntilAtIsNullOrderByEffectiveFromAtDesc(Long groupId);
    void deleteAllByGroupId(Long groupId);
}
