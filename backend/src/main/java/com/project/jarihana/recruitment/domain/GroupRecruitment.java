package com.project.jarihana.recruitment.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.group.domain.Group;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "group_recruitment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupRecruitment extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @Enumerated(EnumType.STRING)
    @Column(name = "join_method", nullable = false, length = 20)
    private JoinMethod joinMethod;

    @Column(name = "capacity", nullable = false)
    private int capacity;

    @Column(name = "starts_at", nullable = false)
    private LocalDateTime startsAt;

    @Column(name = "ends_at")
    private LocalDateTime endsAt;

    private GroupRecruitment(
            Long id,
            Group group,
            JoinMethod joinMethod,
            int capacity,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {
        this.id = id;
        this.group = validateGroup(group);
        this.joinMethod = require(joinMethod, "가입 방식");
        this.capacity = validateCapacity(capacity);
        this.startsAt = require(startsAt, "모집 시작 시각");
        this.endsAt = endsAt;
        validatePeriod(this.startsAt, this.endsAt);
    }

    public static GroupRecruitment create(
            Group group,
            JoinMethod joinMethod,
            int capacity,
            LocalDateTime startsAt,
            LocalDateTime endsAt
    ) {
        return new GroupRecruitment(null, group, joinMethod, capacity, startsAt, endsAt);
    }

    public RecruitmentPhase phaseAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        if (currentTime.isBefore(startsAt)) {
            return RecruitmentPhase.UPCOMING;
        }
        if (endsAt == null) {
            return RecruitmentPhase.ALWAYS_OPEN;
        }
        if (currentTime.isBefore(endsAt)) {
            return RecruitmentPhase.OPEN;
        }
        return RecruitmentPhase.CLOSED;
    }

    public boolean isOpenAt(LocalDateTime now) {
        RecruitmentPhase phase = phaseAt(now);
        return phase == RecruitmentPhase.OPEN || phase == RecruitmentPhase.ALWAYS_OPEN;
    }

    public boolean hasCapacity(int approvedCount) {
        validateApprovedCount(approvedCount);
        return approvedCount < capacity;
    }

    public GroupRecruitment closeAt(LocalDateTime now) {
        LocalDateTime currentTime = require(now, "현재 시각");
        if (phaseAt(currentTime) == RecruitmentPhase.CLOSED) {
            throw new IllegalStateException("이미 마감된 모집 공고입니다.");
        }
        LocalDateTime closedStartsAt = startsAt.isAfter(currentTime) ? currentTime : startsAt;
        return new GroupRecruitment(id, group, joinMethod, capacity, closedStartsAt, currentTime);
    }

    public GroupRecruitment closeIfFull(int approvedCount, LocalDateTime now) {
        if (hasCapacity(approvedCount)) {
            return this;
        }
        return closeAt(now);
    }

    private static Group validateGroup(Group group) {
        Group requiredGroup = require(group, "그룹");
        if (!requiredGroup.isActive()) {
            throw new IllegalArgumentException("ACTIVE 상태의 그룹에만 모집 공고를 생성할 수 있습니다.");
        }
        return requiredGroup;
    }

    private static int validateCapacity(int capacity) {
        if (capacity < 1) {
            throw new IllegalArgumentException("모집 인원은 1명 이상이어야 합니다.");
        }
        return capacity;
    }

    private static void validateApprovedCount(int approvedCount) {
        if (approvedCount < 0) {
            throw new IllegalArgumentException("승인 인원은 음수일 수 없습니다.");
        }
    }

    private static void validatePeriod(LocalDateTime startsAt, LocalDateTime endsAt) {
        if (endsAt != null && endsAt.isBefore(startsAt)) {
            throw new IllegalArgumentException("모집 종료 시각은 시작 시각보다 빠를 수 없습니다.");
        }
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

    public Group getGroup() {
        return group;
    }

    public JoinMethod getJoinMethod() {
        return joinMethod;
    }

    public int getCapacity() {
        return capacity;
    }

    public LocalDateTime getStartsAt() {
        return startsAt;
    }

    public LocalDateTime getEndsAt() {
        return endsAt;
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof GroupRecruitment other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}
