package com.project.jarihana.pushsubscription.query.repository;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import com.project.jarihana.pushsubscription.query.repository.dto.PushSubscriptionProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.Optional;

public interface PushSubscriptionQueryRepository extends Repository<PushSubscription, Long> {
    @Query("""
            select new com.project.jarihana.pushsubscription.query.repository.dto.PushSubscriptionProjection(
                s.id, s.generation, s.enabled, s.lastSeenAt, s.createdAt)
            from PushSubscription s where s.member.id = :memberId
              and (cast(:createdAt as LocalDateTime) is null or s.createdAt < :createdAt
                   or (s.createdAt = :createdAt and s.id < :id))
            order by s.createdAt desc, s.id desc
            """)
    Slice<PushSubscriptionProjection> findPage(@Param("memberId") long memberId, @Param("createdAt") LocalDateTime createdAt,
                                              @Param("id") Long id, Pageable pageable);

    @Query("""
            select new com.project.jarihana.pushsubscription.query.repository.dto.PushSubscriptionProjection(
                s.id, s.generation, s.enabled, s.lastSeenAt, s.createdAt)
            from PushSubscription s where s.id = :id and s.member.id = :memberId and s.enabled = true and s.generation = :generation
            """)
    Optional<PushSubscriptionProjection> findActive(@Param("id") long id, @Param("memberId") long memberId,
                                                    @Param("generation") long generation);
}
