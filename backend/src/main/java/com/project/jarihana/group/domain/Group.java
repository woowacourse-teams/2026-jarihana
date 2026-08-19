package com.project.jarihana.group.domain;

import java.time.LocalDateTime;

public final class Group {

    private static final int NAME_MAX_LENGTH = 50;
    private static final int INTRODUCTION_MAX_LENGTH = 100;
    private static final int DESCRIPTION_MAX_LENGTH = 5_000;
    private static final long DELETABLE_HOURS = 24;

    private final Long id;
    private final GroupType type;
    private final RecurringGroupSchedule recurringSchedule;
    private final SessionGroupSchedule sessionSchedule;
    private final String name;
    private final String introduction;
    private final String description;
    private final String representativeImageKey;
    private final GroupStatus status;
    private final LocalDateTime createdAt;

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
        this.createdAt = require(createdAt, "생성 시각");
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

    public boolean isActive() {
        return status == GroupStatus.ACTIVE;
    }

    public boolean canDeleteAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        LocalDateTime deletionDeadline = createdAt.plusHours(DELETABLE_HOURS);
        return isActive() && !currentTime.isBefore(createdAt) && !currentTime.isAfter(deletionDeadline);
    }

    public boolean canEndAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        LocalDateTime deletionDeadline = createdAt.plusHours(DELETABLE_HOURS);
        return isActive() && currentTime.isAfter(deletionDeadline);
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
                createdAt
        );
    }

    public Group endAt(LocalDateTime now) {
        if (!canEndAt(now)) {
            throw new IllegalStateException("그룹은 생성 후 24시간이 지난 ACTIVE 상태에서만 종료할 수 있습니다.");
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
                createdAt
        );
    }

    private void requireActive() {
        if (!isActive()) {
            throw new IllegalStateException("ACTIVE 상태의 그룹만 변경할 수 있습니다.");
        }
    }

    private static void validateSchedule(
            GroupType type,
            RecurringGroupSchedule recurringSchedule,
            SessionGroupSchedule sessionSchedule
    ) {
        if (type == GroupType.SESSION) {
            if (recurringSchedule != null || sessionSchedule == null) {
                throw new IllegalArgumentException("SESSION은 일회성 일정만 가져야 합니다.");
            }
            return;
        }
        if (sessionSchedule != null) {
            throw new IllegalArgumentException("CLUB과 STUDY는 일회성 일정을 가질 수 없습니다.");
        }
    }

    private static String validateRequiredLength(String value, int maxLength, String fieldName) {
        if (value == null || value.isBlank() || value.length() > maxLength) {
            throw new IllegalArgumentException(fieldName + "은 1자 이상 " + maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private static String validateNullableLength(String value, int maxLength, String fieldName) {
        if (value != null && value.length() > maxLength) {
            throw new IllegalArgumentException(fieldName + "은 " + maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new IllegalArgumentException(fieldName + "은 필수입니다.");
        }
        return value;
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

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
