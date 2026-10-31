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
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Getter
@Entity
@Table(
        name = "sparring_post",
        indexes = @Index(name = "idx_sparring_post_topic_id", columnList = "topic_id,id"),
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_sparring_post_request",
                        columnNames = {"topic_id", "member_id", "request_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SparringPost extends BaseEntity {
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

    @Column(nullable = false, length = 160)
    private String text;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_id")
    private SparringPost replyTo;

    private SparringPost(
            SparringVote vote,
            String text,
            SparringPost replyTo,
            UUID requestId,
            LocalDateTime now) {
        super(now);
        this.topic = vote.getTopic();
        this.member = vote.getMember();
        this.side = vote.getSide();
        this.text = SparringText.required(text, 160);
        this.replyTo = replyTo;
        this.requestId = Objects.requireNonNull(requestId);
    }

    public static SparringPost create(
            SparringVote vote,
            String text,
            SparringPost replyTo,
            UUID requestId,
            LocalDateTime now) {
        return new SparringPost(vote, text, replyTo, requestId, now);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) return true;
        return object instanceof SparringPost other
                && id != null
                && other.id != null
                && id.equals(other.id);
    }
}
