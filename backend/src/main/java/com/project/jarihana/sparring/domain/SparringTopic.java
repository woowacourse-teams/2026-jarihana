package com.project.jarihana.sparring.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Getter
@Entity
@Table(
        name = "sparring_topic",
        indexes = @Index(name = "idx_sparring_topic_created_id", columnList = "created_at,id"))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SparringTopic extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String title;

    @Column(name = "claim_a", nullable = false, length = 32)
    private String claimA;

    @Column(name = "claim_b", nullable = false, length = 32)
    private String claimB;

    @Column(nullable = false, length = 240)
    private String description;

    @Column(nullable = false)
    private long revision;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "creator_id", nullable = false)
    private Member creator;

    private SparringTopic(
            String title,
            String a,
            String b,
            String description,
            Member creator,
            LocalDateTime now) {
        super(now);
        this.title = SparringText.required(title, 80);
        this.claimA = SparringText.required(a, 32);
        this.claimB = SparringText.required(b, 32);
        if (claimA.equalsIgnoreCase(claimB)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "서로 다른 두 입장을 적어주세요.");
        }
        this.description = description == null ? "" : description.trim();
        if (this.description.length() > 240) SparringText.required(this.description, 240);
        this.creator = Objects.requireNonNull(creator);
        this.revision = 1;
    }

    public static SparringTopic create(
            String title,
            String a,
            String b,
            String description,
            Member creator,
            LocalDateTime now) {
        return new SparringTopic(title, a, b, description, creator, now);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) return true;
        return object instanceof SparringTopic other
                && id != null
                && other.id != null
                && id.equals(other.id);
    }
}
