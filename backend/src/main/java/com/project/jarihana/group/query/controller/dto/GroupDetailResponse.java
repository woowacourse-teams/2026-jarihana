package com.project.jarihana.group.query.controller.dto;

import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.group.domain.SessionGroupSchedule;
import com.project.jarihana.group.query.repository.dto.GroupDetailMember;
import com.project.jarihana.group.query.service.dto.GroupDetailResult;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.registration.domain.RegistrationStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public record GroupDetailResponse(
        Long id,
        String type,
        String meetingType,
        String location,
        String status,
        String name,
        String introduction,
        String description,
        String representativeImageUrl,
        RecurringSchedule recurringSchedule,
        SessionSchedule sessionSchedule,
        GroupLeader leader,
        int memberCount,
        ActiveRecruitment activeRecruitment,
        GroupMemberRole currentMemberRole,
        RegistrationStatus currentMemberRegistrationStatus,
        LocalDateTime createdAt
) {

    public static GroupDetailResponse from(GroupDetailResult result) {
        Group group = result.group();
        return new GroupDetailResponse(
                group.getId(),
                group.getType().name(),
                group.getMeetingType().name(),
                group.getLocation(),
                group.getStatus().name(),
                group.getName(),
                group.getIntroduction(),
                group.getDescription(),
                result.representativeImageUrl(),
                RecurringSchedule.from(group.getRecurringSchedule()),
                SessionSchedule.from(group.getSessionSchedule()),
                GroupLeader.from(result.leader()),
                result.members().size(),
                ActiveRecruitment.from(result.activeRecruitment(), result.approvedCount()),
                result.currentMemberRole(),
                result.currentMemberRegistrationStatus(),
                group.getCreatedAt()
        );
    }

    public record RecurringSchedule(
            List<String> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime
    ) {

        private static RecurringSchedule from(RecurringGroupSchedule schedule) {
            if (schedule == null) {
                return null;
            }
            return new RecurringSchedule(
                    schedule.getActivityDays().values().stream().map(Enum::name).toList(),
                    schedule.getStartTime(),
                    schedule.getEndTime()
            );
        }
    }

    public record SessionSchedule(
            LocalDate sessionDate,
            LocalTime startTime,
            LocalTime endTime
    ) {

        private static SessionSchedule from(SessionGroupSchedule schedule) {
            if (schedule == null) {
                return null;
            }
            return new SessionSchedule(
                    schedule.getSessionDate(),
                    schedule.getStartTime(),
                    schedule.getEndTime()
            );
        }
    }

    public record GroupLeader(Long memberId, String crewName, int generation, String avatarUrl) {

        private static GroupLeader from(GroupDetailMember member) {
            if (member == null) {
                return null;
            }
            return new GroupLeader(
                    member.memberId(),
                    member.member().getCrewName(),
                    member.member().getGeneration(),
                    GithubAvatarUrl.from(member.member().getGithubId())
            );
        }
    }

    public record ActiveRecruitment(
            Long id,
            String joinMethod,
            int capacity,
            int approvedCount,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {

        private static ActiveRecruitment from(GroupRecruitment recruitment, int approvedCount) {
            if (recruitment == null) {
                return null;
            }
            return new ActiveRecruitment(
                    recruitment.getId(),
                    recruitment.getJoinMethod().name(),
                    recruitment.getCapacity(),
                    approvedCount,
                    recruitment.getStartsAt(),
                    recruitment.getEndsAt()
            );
        }
    }
}
