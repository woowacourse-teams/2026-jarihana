package com.project.jarihana.member.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

/**
 * 서비스가 확인할 수 있는 소속이다. 회원은 소속마다 정해진 방법으로 확인된 뒤에만 {@link MemberAffiliation}을 얻는다.
 *
 * <p>소속 행은 마이그레이션으로 넣고 애플리케이션은 읽기만 한다. 지금은 크루 명단으로 확인하는 우아한테크코스 하나다.
 */
@Getter
@Entity
@Table(name = "affiliation")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Affiliation extends BaseEntity {

    /**
     * 크루 명단으로 확인하는 우아한테크코스 소속의 코드.
     */
    public static final String WOOTECO_CODE = "WOOTECO";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "code", nullable = false, length = 30)
    private String code;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof Affiliation other)) {
            return false;
        }
        if (id == null || other.id == null) {
            return false;
        }
        return Objects.equals(id, other.id);
    }
}
