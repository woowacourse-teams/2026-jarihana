package com.project.jarihana.group.calendar;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "group_location_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupLocationHistory extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @Column(name = "location", length = 255)
    private String location;

    @Column(name = "effective_from_at", nullable = false)
    private LocalDateTime effectiveFromAt;

    @Column(name = "effective_until_at")
    private LocalDateTime effectiveUntilAt;

    private GroupLocationHistory(Long id, Group group, String location, LocalDateTime from,
                                 LocalDateTime until, LocalDateTime createdAt) {
        super(createdAt);
        if (group == null || from == null || createdAt == null ||
                until != null && !until.isAfter(from) || location != null && location.length() > 255) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "장소 이력이 올바르지 않습니다.");
        }
        this.id = id;
        this.group = group;
        this.location = location;
        this.effectiveFromAt = from;
        this.effectiveUntilAt = until;
    }

    public static GroupLocationHistory create(Group group, String location, LocalDateTime from) {
        return new GroupLocationHistory(null, group, location, from, null, from);
    }

    public GroupLocationHistory closeAt(LocalDateTime until) {
        if (effectiveUntilAt != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이미 종료된 장소 이력입니다.");
        }
        return new GroupLocationHistory(id, group, location, effectiveFromAt, until, getCreatedAt());
    }

    public Long getId() { return id; }
    public Group getGroup() { return group; }
    public String getLocation() { return location; }
    public LocalDateTime getEffectiveFromAt() { return effectiveFromAt; }
    public LocalDateTime getEffectiveUntilAt() { return effectiveUntilAt; }
}
