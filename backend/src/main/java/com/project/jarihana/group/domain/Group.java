package com.project.jarihana.group.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.MemberType;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(
        name = "groups",
        indexes = @Index(name = "idx_groups_status_created_id", columnList = "status, created_at DESC, id DESC"),
        uniqueConstraints = @UniqueConstraint(name = "uk_groups_name", columnNames = "name")
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Group extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private GroupType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "meeting_type", nullable = false, length = 20)
    private MeetingType meetingType;

    @Column(name = "location", length = 255)
    private String location;

    @Column(name = "show_base_schedule_in_calendar", nullable = false)
    private boolean showBaseScheduleInCalendar;

    @Column(name = "clubhouse_setup_enabled", nullable = false, updatable = false)
    private boolean clubhouseSetupEnabled = true;

    public boolean isClubhouseSetupEnabled() {
        return clubhouseSetupEnabled;
    }

    @Column(name = "ended_on")
    private LocalDate endedOn;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "activityDays", column = @Column(name = "recurring_activity_days")),
            @AttributeOverride(name = "startTime", column = @Column(name = "recurring_start_time")),
            @AttributeOverride(name = "endTime", column = @Column(name = "recurring_end_time"))
    })
    private RecurringGroupSchedule recurringSchedule;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "sessionDate", column = @Column(name = "session_date")),
            @AttributeOverride(name = "startTime", column = @Column(name = "session_start_time")),
            @AttributeOverride(name = "endTime", column = @Column(name = "session_end_time"))
    })
    private SessionGroupSchedule sessionSchedule;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "introduction", nullable = false, length = 100)
    private String introduction;

    @Column(name = "description", length = 10_000)
    private String description;

    @Column(name = "representative_image_key")
    private String representativeImageKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private GroupStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private GroupVisibility visibility = GroupVisibility.PUBLIC;

    private Group(
            Long id,
            Long version,
            GroupType type,
            MeetingType meetingType,
            String location,
            RecurringGroupSchedule recurringSchedule,
            SessionGroupSchedule sessionSchedule,
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            GroupStatus status,
            LocalDateTime createdAt,
            boolean showBaseScheduleInCalendar,
            LocalDate endedOn,
            GroupVisibility visibility
    ) {
        super(require(createdAt, "생성 시각"));
        this.id = id;
        this.version = version;
        this.type = require(type, "그룹 유형");
        this.meetingType = require(meetingType, "모임 방식");
        this.location = validateNullableLength(location, 255, "장소");
        validateSchedule(type, recurringSchedule, sessionSchedule);
        this.recurringSchedule = recurringSchedule;
        this.sessionSchedule = sessionSchedule;
        this.name = validateRequiredLength(name, 50, "그룹 이름");
        this.introduction = validateRequiredLength(introduction, 100, "한 줄 소개");
        this.description = validateNullableLength(description, 10_000, "상세 소개");
        this.representativeImageKey = representativeImageKey;
        this.status = require(status, "그룹 상태");
        this.showBaseScheduleInCalendar = showBaseScheduleInCalendar;
        this.endedOn = endedOn;
        this.visibility = require(visibility, "공개 범위");
    }

    private static void validateSchedule(
            GroupType type,
            RecurringGroupSchedule recurringSchedule,
            SessionGroupSchedule sessionSchedule
    ) {
        if (type == GroupType.SESSION) {
            if (recurringSchedule != null || sessionSchedule == null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "SESSION은 일회성 일정만 가져야 합니다.");
            }
            return;
        }
        if (sessionSchedule != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "CLUB과 STUDY는 일회성 일정을 가질 수 없습니다.");
        }
    }

    private static String validateRequiredLength(String value, int maxLength, String fieldName) {
        if (value == null || value.isBlank() || value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 1자 이상 " + maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private static String validateNullableLength(String value, int maxLength, String fieldName) {
        if (value != null && value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 " + maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    public static Group createClub(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            RecurringGroupSchedule recurringSchedule,
            LocalDateTime createdAt
    ) {
        return createClub(
                name,
                introduction,
                description,
                representativeImageKey,
                MeetingType.FLEXIBLE,
                null,
                recurringSchedule,
                createdAt
        );
    }

    public static Group createClub(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            MeetingType meetingType,
            String location,
            RecurringGroupSchedule recurringSchedule,
            LocalDateTime createdAt
    ) {
        return createRecurringGroup(
                GroupType.CLUB,
                name,
                introduction,
                description,
                representativeImageKey,
                meetingType,
                location,
                recurringSchedule,
                createdAt
        );
    }

    private static Group createRecurringGroup(
            GroupType type,
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            MeetingType meetingType,
            String location,
            RecurringGroupSchedule recurringSchedule,
            LocalDateTime createdAt
    ) {
        return new Group(
                null,
                null,
                type,
                meetingType,
                location,
                recurringSchedule,
                null,
                name,
                introduction,
                description,
                representativeImageKey,
                GroupStatus.ACTIVE,
                createdAt,
                true,
                null,
                GroupVisibility.PUBLIC
        );
    }

    public static Group createStudy(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            RecurringGroupSchedule recurringSchedule,
            LocalDateTime createdAt
    ) {
        return createStudy(
                name,
                introduction,
                description,
                representativeImageKey,
                MeetingType.FLEXIBLE,
                null,
                recurringSchedule,
                createdAt
        );
    }

    public static Group createStudy(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            MeetingType meetingType,
            String location,
            RecurringGroupSchedule recurringSchedule,
            LocalDateTime createdAt
    ) {
        return createRecurringGroup(
                GroupType.STUDY,
                name,
                introduction,
                description,
                representativeImageKey,
                meetingType,
                location,
                recurringSchedule,
                createdAt
        );
    }

    public static Group createSession(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            SessionGroupSchedule sessionSchedule,
            LocalDateTime createdAt
    ) {
        return createSession(
                name,
                introduction,
                description,
                representativeImageKey,
                MeetingType.FLEXIBLE,
                null,
                sessionSchedule,
                createdAt
        );
    }

    public static Group createSession(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            MeetingType meetingType,
            String location,
            SessionGroupSchedule sessionSchedule,
            LocalDateTime createdAt
    ) {
        return new Group(
                null,
                null,
                GroupType.SESSION,
                meetingType,
                location,
                null,
                sessionSchedule,
                name,
                introduction,
                description,
                representativeImageKey,
                GroupStatus.ACTIVE,
                createdAt,
                true,
                null,
                GroupVisibility.PUBLIC
        );
    }

    public boolean canDeleteAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        LocalDateTime createdAt = getCreatedAt();
        LocalDateTime deletionDeadline = createdAt.plusHours(24);
        return isActive() && !currentTime.isBefore(createdAt) && !currentTime.isAfter(deletionDeadline);
    }

    public boolean isActive() {
        return status == GroupStatus.ACTIVE;
    }

    public LocalDateTime getCreatedAt() {
        return super.getCreatedAt();
    }

    public Group modify(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            RecurringGroupSchedule recurringSchedule,
            SessionGroupSchedule sessionSchedule
    ) {
        return modify(
                name,
                introduction,
                description,
                representativeImageKey,
                this.meetingType,
                this.location,
                recurringSchedule,
                sessionSchedule
        );
    }

    public Group modify(
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            MeetingType meetingType,
            String location,
            RecurringGroupSchedule recurringSchedule,
            SessionGroupSchedule sessionSchedule
    ) {
        requireActive();
        return new Group(
                id,
                version,
                type,
                meetingType,
                location,
                recurringSchedule,
                sessionSchedule,
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt(),
                showBaseScheduleInCalendar,
                endedOn,
                visibility
        );
    }

    private void requireActive() {
        if (!isActive()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "ACTIVE 상태의 그룹만 변경할 수 있습니다.");
        }
    }

    public Group replaceRecurringSchedule(RecurringGroupSchedule schedule) {
        requireActive();
        if (type == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "SESSION 그룹에는 반복 일정을 등록할 수 없습니다.");
        }
        return new Group(
                id,
                version,
                type,
                meetingType,
                location,
                require(schedule, "반복 일정"),
                null,
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt(),
                showBaseScheduleInCalendar,
                endedOn,
                visibility
        );
    }

    public Group removeRecurringSchedule() {
        requireActive();
        if (type == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "SESSION 그룹에는 반복 일정이 없습니다.");
        }
        if (recurringSchedule == null) {
            throw new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND, "등록된 반복 일정이 없습니다.");
        }
        return new Group(
                id,
                version,
                type,
                meetingType,
                location,
                null,
                null,
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt(),
                showBaseScheduleInCalendar,
                endedOn,
                visibility
        );
    }

    public Group replaceSessionSchedule(SessionGroupSchedule schedule) {
        requireActive();
        if (type != GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "CLUB과 STUDY 그룹에는 세션 일정을 등록할 수 없습니다.");
        }
        return new Group(
                id,
                version,
                type,
                meetingType,
                location,
                null,
                require(schedule, "세션 일정"),
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt(),
                showBaseScheduleInCalendar,
                endedOn,
                visibility
        );
    }

    public Group endAt(LocalDateTime now) {
        if (!canEndAt(now)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "그룹은 생성 후 24시간이 지난 ACTIVE 상태에서만 종료할 수 있습니다.");
        }
        return new Group(
                id,
                version,
                type,
                meetingType,
                location,
                recurringSchedule,
                sessionSchedule,
                name,
                introduction,
                description,
                representativeImageKey,
                GroupStatus.ENDED,
                getCreatedAt(),
                showBaseScheduleInCalendar,
                now.toLocalDate(),
                visibility
        );
    }

    public Group withBaseScheduleVisibility(boolean visible) {
        requireActive();
        return new Group(id, version, type, meetingType, location, recurringSchedule, sessionSchedule,
                name, introduction, description, representativeImageKey, status, getCreatedAt(),
                visible, endedOn, visibility);
    }

    /**
     * 공개 범위를 바꾼다. 크루 전용으로 켜는 것은 크루인 모임장만 할 수 있다. 위임으로 모임장이 된 비크루는
     * 전체 공개나 비공개로 바꿀 수 있다. 공개 범위 전환은 기존 구성원에 영향을 주지 않는다.
     */
    public Group changeVisibility(GroupVisibility nextVisibility, MemberType leaderType) {
        requireActive();
        GroupVisibility next = require(nextVisibility, "공개 범위");
        if (next == visibility) {
            return this;
        }
        if (next == GroupVisibility.CREW_ONLY && leaderType != MemberType.CREW) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "크루인 모임장만 크루 전용으로 바꿀 수 있습니다.");
        }
        return new Group(id, version, type, meetingType, location, recurringSchedule, sessionSchedule,
                name, introduction, description, representativeImageKey, status, getCreatedAt(),
                showBaseScheduleInCalendar, endedOn, next);
    }

    public boolean isVisibleTo(MemberType viewerType, boolean groupMember) {
        return visibility.isVisibleTo(viewerType, groupMember);
    }

    public boolean allowsInvitationTo(MemberType inviteeType) {
        return visibility.allowsInvitationTo(inviteeType);
    }

    public boolean canEndAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        LocalDateTime createdAt = getCreatedAt();
        LocalDateTime deletionDeadline = createdAt.plusHours(24);
        return isActive() && currentTime.isAfter(deletionDeadline);
    }

    public Long getId() {
        return id;
    }

    public GroupType getType() {
        return type;
    }

    public MeetingType getMeetingType() {
        return meetingType;
    }

    public String getLocation() {
        return location;
    }

    public RecurringGroupSchedule getRecurringSchedule() {
        return recurringSchedule;
    }

    public SessionGroupSchedule getSessionSchedule() {
        return sessionSchedule;
    }

    public String getName() {
        return name;
    }

    public String getIntroduction() {
        return introduction;
    }

    public String getDescription() {
        return description;
    }

    public String getRepresentativeImageKey() {
        return representativeImageKey;
    }

    public GroupStatus getStatus() {
        return status;
    }

    public boolean isShowBaseScheduleInCalendar() {
        return showBaseScheduleInCalendar;
    }

    public LocalDate getEndedOn() {
        return endedOn;
    }

    public GroupVisibility getVisibility() {
        return visibility;
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof Group other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }
}
