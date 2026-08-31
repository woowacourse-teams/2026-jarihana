package com.project.jarihana.group.query.service.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public record GroupListResult(List<Item> items, String nextCursor, boolean hasNext) {

    public GroupListResult {
        items = List.copyOf(items);
    }

    public record Item(
            Long id,
            String type,
            String status,
            String name,
            String introduction,
            String representativeImageUrl,
            RecurringSchedule recurringSchedule,
            SessionSchedule sessionSchedule,
            Leader leader,
            int memberCount,
            ActiveRecruitment activeRecruitment
    ) {
    }

    public record RecurringSchedule(
            List<String> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime
    ) {
    }

    public record SessionSchedule(
            LocalDate sessionDate,
            LocalTime startTime,
            LocalTime endTime
    ) {
    }

    public record Leader(Long memberId, String crewName, Integer generation, String avatarUrl) {
    }

    public record ActiveRecruitment(
            Long id,
            String joinMethod,
            int capacity,
            int approvedCount,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {
    }
}
