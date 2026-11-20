package com.project.jarihana.member.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

/**
 * 우테코 크루 명단의 한 줄이다. 가입과 GitHub 로그인 때 이 명단에 있는 GitHub 계정만 크루가 된다.
 *
 * <p>명단은 운영자가 저장소 밖 CSV로 넣고 애플리케이션은 읽기만 한다. 크루 인증에 필요한 값만 두고
 * 크루 닉네임과 GitHub 로그인 이름은 저장하지 않는다.
 */
@Getter
@Entity
@Table(name = "crew_roster")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CrewRosterEntry extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "github_id", nullable = false, length = 50)
    private String githubId;

    @Column(name = "generation", nullable = false)
    private Integer generation;

    @Enumerated(EnumType.STRING)
    @Column(name = "course", nullable = false, length = 20)
    private Course course;

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof CrewRosterEntry other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return id.equals(other.id);
    }
}
