package com.project.jarihana.sparring.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.member.domain.Member;

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
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Getter
@Entity
@Table(
        name = "sparring_vote",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_sparring_vote_member",
                        columnNames = {"topic_id", "member_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SparringVote extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "topic_id", nullable = false)
    private SparringTopic topic;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private SparringSide side;

    private SparringVote(
            Long id,
            SparringTopic topic,
            Member member,
            SparringSide side,
            LocalDateTime createdAt) {
        super(createdAt);
        this.id = id;
        this.topic = topic;
        this.member = member;
        this.side = Objects.requireNonNull(side);
    }

    public static SparringVote create(
            SparringTopic topic, Member member, SparringSide side, LocalDateTime now) {
        return new SparringVote(null, topic, member, side, now);
    }

    public SparringVote choosing(SparringSide next) {
        return new SparringVote(id, topic, member, next, getCreatedAt());
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) return true;
        return object instanceof SparringVote other
                && id != null
                && other.id != null
                && id.equals(other.id);
    }
}
