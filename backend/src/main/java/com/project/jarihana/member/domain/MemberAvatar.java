package com.project.jarihana.member.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.Objects;

@Entity
@Table(name = "member_avatar")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberAvatar extends BaseEntity {
    @Id
    @Column(name = "member_id")
    private Long id;

    @Embedded
    private AvatarAppearance appearance;

    private MemberAvatar(long memberId, AvatarAppearance appearance) {
        this.id = memberId;
        this.appearance = appearance;
    }

    public static MemberAvatar of(long memberId, AvatarAppearance appearance) {
        return new MemberAvatar(memberId, Objects.requireNonNull(appearance));
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
        if (!(object instanceof MemberAvatar other)) {
            return false;
        }
        return id != null && id.equals(other.id);
    }
}
