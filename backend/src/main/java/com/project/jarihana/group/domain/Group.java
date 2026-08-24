package com.project.jarihana.group.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(
        name = "groups",
        uniqueConstraints = @UniqueConstraint(name = "uk_groups_name", columnNames = "name")
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Group extends BaseEntity {

    private static final int NAME_MAX_LENGTH = 50;
    private static final int INTRODUCTION_MAX_LENGTH = 100;
    private static final int DESCRIPTION_MAX_LENGTH = 5_000;
    private static final long DELETABLE_HOURS = 24;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private GroupType type;

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

    @Column(name = "name", nullable = false, length = NAME_MAX_LENGTH)
    private String name;

    @Column(name = "introduction", nullable = false, length = INTRODUCTION_MAX_LENGTH)
    private String introduction;

    @Column(name = "description", length = DESCRIPTION_MAX_LENGTH)
    private String description;

    @Column(name = "representative_image_key")
    private String representativeImageKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private GroupStatus status;

    private Group(
            Long id,
            GroupType type,
            RecurringGroupSchedule recurringSchedule,
            SessionGroupSchedule sessionSchedule,
            String name,
            String introduction,
            String description,
            String representativeImageKey,
            GroupStatus status,
            LocalDateTime createdAt
    ) {
        super(require(createdAt, "생성 시각"));
        this.id = id;
        this.type = require(type, "그룹 유형");
        validateSchedule(type, recurringSchedule, sessionSchedule);
        this.recurringSchedule = recurringSchedule;
        this.sessionSchedule = sessionSchedule;
        this.name = validateRequiredLength(name, NAME_MAX_LENGTH, "그룹 이름");
        this.introduction = validateRequiredLength(introduction, INTRODUCTION_MAX_LENGTH, "한 줄 소개");
        this.description = validateNullableLength(description, DESCRIPTION_MAX_LENGTH, "상세 소개");
        this.representativeImageKey = representativeImageKey;
        this.status = require(status, "그룹 상태");
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
        return createRecurringGroup(
                GroupType.CLUB,
                name,
                introduction,
                description,
                representativeImageKey,
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
            RecurringGroupSchedule recurringSchedule,
            LocalDateTime createdAt
    ) {
        return new Group(
                null,
                type,
                recurringSchedule,
                null,
                name,
                introduction,
                description,
                representativeImageKey,
                GroupStatus.ACTIVE,
                createdAt
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
        return createRecurringGroup(
                GroupType.STUDY,
                name,
                introduction,
                description,
                representativeImageKey,
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
        return new Group(
                null,
                GroupType.SESSION,
                null,
                sessionSchedule,
                name,
                introduction,
                description,
                representativeImageKey,
                GroupStatus.ACTIVE,
                createdAt
        );
    }

    public boolean canDeleteAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        LocalDateTime createdAt = getCreatedAt();
        LocalDateTime deletionDeadline = createdAt.plusHours(DELETABLE_HOURS);
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
        requireActive();
        return new Group(
                id,
                type,
                recurringSchedule,
                sessionSchedule,
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt()
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
                type,
                require(schedule, "반복 일정"),
                null,
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt()
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
                type,
                null,
                null,
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt()
        );
    }

    public Group replaceSessionSchedule(SessionGroupSchedule schedule) {
        requireActive();
        if (type != GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "CLUB과 STUDY 그룹에는 세션 일정을 등록할 수 없습니다.");
        }
        return new Group(
                id,
                type,
                null,
                require(schedule, "세션 일정"),
                name,
                introduction,
                description,
                representativeImageKey,
                status,
                getCreatedAt()
        );
    }

    public Group endAt(LocalDateTime now) {
        if (!canEndAt(now)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "그룹은 생성 후 24시간이 지난 ACTIVE 상태에서만 종료할 수 있습니다.");
        }
        return new Group(
                id,
                type,
                recurringSchedule,
                sessionSchedule,
                name,
                introduction,
                description,
                representativeImageKey,
                GroupStatus.ENDED,
                getCreatedAt()
        );
    }

    public boolean canEndAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        LocalDateTime createdAt = getCreatedAt();
        LocalDateTime deletionDeadline = createdAt.plusHours(DELETABLE_HOURS);
        return isActive() && currentTime.isAfter(deletionDeadline);
    }

    public Long getId() {
        return id;
    }

    public GroupType getType() {
        return type;
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
