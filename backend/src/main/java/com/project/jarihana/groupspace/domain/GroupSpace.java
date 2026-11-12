package com.project.jarihana.groupspace.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.group.domain.Group;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "group_space")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupSpace extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false, unique = true)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Group group;

    @Column(name = "room_json", nullable = false, columnDefinition = "text")
    private String roomJson;

    @Column(nullable = false)
    private long revision;

    private GroupSpace(Long id, Group group, String roomJson, long revision, LocalDateTime createdAt) {
        super(createdAt);
        this.id = id;
        this.group = Objects.requireNonNull(group);
        this.roomJson = Objects.requireNonNull(roomJson);
        this.revision = revision;
    }

    public static GroupSpace create(Group group, String roomJson, LocalDateTime now) {
        return new GroupSpace(null, group, roomJson, 1, now);
    }

    public GroupSpace replaceRoom(String roomJson) {
        return new GroupSpace(id, group, roomJson, revision + 1, getCreatedAt());
    }

    public Long getId() { return id; }
    public String getRoomJson() { return roomJson; }
    public long getRevision() { return revision; }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        return other instanceof GroupSpace space && id != null && id.equals(space.id);
    }

    @Override
    public int hashCode() { return Objects.hashCode(id); }
}
