package com.project.jarihana.member.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

/**
 * 회원이 확인된 소속이다. 한 회원은 여러 소속을 가질 수 있고, 같은 소속은 한 번만 가진다.
 *
 * <p>소속 확인은 여러 요청에서 겹칠 수 있어 행은 {@code insert ... on conflict do nothing}으로만 만든다.
 */
@Getter
@Entity
@Table(
        name = "member_affiliation",
        uniqueConstraints = @UniqueConstraint(name = "uk_member_affiliation", columnNames = {"member_id", "affiliation_id"})
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberAffiliation extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "affiliation_id", nullable = false)
    private Affiliation affiliation;

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof MemberAffiliation other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return Objects.equals(id, other.id);
    }
}
