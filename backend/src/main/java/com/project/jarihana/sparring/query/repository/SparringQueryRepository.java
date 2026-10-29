package com.project.jarihana.sparring.query.repository;

import com.project.jarihana.sparring.domain.SparringTopic;
import com.project.jarihana.sparring.query.repository.dto.SparringPostProjection;
import com.project.jarihana.sparring.query.repository.dto.SparringTopicProjection;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SparringQueryRepository extends Repository<SparringTopic, Long> {
    String TOPIC_SELECT =
            """
            select t.id, t.title, t.claim_a as claimA, t.claim_b as claimB, t.description,
                   t.revision, t.created_at as createdAt, t.closes_at as closesAt,
                   (select i.image_key from image_reference r join image_upload i on i.id=r.image_upload_id
                    where r.reference_type='SPARRING_REPRESENTATIVE' and r.owner_id=t.id) as representativeImageKey,
                   (select count(*) from sparring_vote v where v.topic_id=t.id and v.side='MINT') as votesA,
                   (select count(*) from sparring_vote v where v.topic_id=t.id and v.side='CORAL') as votesB,
                   (select count(*) from sparring_post p where p.topic_id=t.id) as postCount,
                   (select v.side from sparring_vote v where v.topic_id=t.id and v.member_id=:memberId) as mySide
            from sparring_topic t
            """;

    @Query(value = TOPIC_SELECT + " where t.id=:id", nativeQuery = true)
    Optional<SparringTopicProjection> topic(long id, Long memberId);

    @Query(
            value =
                    TOPIC_SELECT
                            + """
                            where (cast(:beforeAt as timestamp) is null or t.created_at < :beforeAt or (t.created_at=:beforeAt and t.id < :beforeId))
                              and position(lower(:keyword) in lower(t.title)) > 0
                              and (:filter not in ('active', 'open_active', 'closed_active') or exists(select 1 from sparring_post p where p.topic_id=t.id))
                              and (:filter not in ('open', 'open_active') or t.closes_at is null or t.closes_at > :now)
                              and (:filter not in ('closed', 'closed_active') or (t.closes_at is not null and t.closes_at <= :now))
                              and (:filter <> 'mine' or exists(select 1 from sparring_vote v where v.topic_id=t.id and v.member_id=:memberId))
                            order by t.created_at desc, t.id desc
                            """,
            nativeQuery = true)
    List<SparringTopicProjection> topics(
            Long memberId,
            String keyword,
            String filter,
            LocalDateTime now,
            LocalDateTime beforeAt,
            Long beforeId,
            Pageable pageable);

    @Query("select t.revision from SparringTopic t where t.id=:id")
    Optional<Long> revision(long id);

    String POST_SELECT =
            """
            select p.id, p.member_id as authorId, m.crew_name as name, m.member_type as memberType,
                   p.side, p.text, p.created_at as createdAt, p.reply_to_id as replyToId,
                   r.member_id as replyAuthorId, rm.crew_name as replyName, r.side as replySide, rm.member_type as replyMemberType, r.text as replyText
            from sparring_post p join member m on m.id=p.member_id
            left join sparring_post r on r.id=p.reply_to_id left join member rm on rm.id=r.member_id
            """;

    @Query(
            value =
                    POST_SELECT
                            + """
                            where p.topic_id=:topicId and (cast(:beforeId as bigint) is null or p.id < :beforeId)
                              and (:mine = false or p.member_id=:memberId) order by p.id desc
                            """,
            nativeQuery = true)
    List<SparringPostProjection> posts(
            long topicId, Long memberId, boolean mine, Long beforeId, Pageable pageable);

    @Query(
            value = POST_SELECT + " where p.topic_id=:topicId and p.id>:afterId order by p.id asc",
            nativeQuery = true)
    List<SparringPostProjection> postsAfter(long topicId, long afterId, Pageable pageable);
}
