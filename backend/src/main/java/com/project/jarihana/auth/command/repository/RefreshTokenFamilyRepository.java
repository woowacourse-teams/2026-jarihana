package com.project.jarihana.auth.command.repository;

import com.project.jarihana.auth.domain.RefreshTokenFamily;
import com.project.jarihana.auth.domain.RefreshTokenRevokeReason;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface RefreshTokenFamilyRepository extends Repository<RefreshTokenFamily, Long> {

    RefreshTokenFamily save(RefreshTokenFamily family);

    /**
     * 처음 폐기한 사유만 남긴다. 재사용 감지와 로그아웃이 겹쳐도 먼저 기록한 사유를 덮어쓰지 않는다.
     */
    @Modifying
    @Query("""
            update RefreshTokenFamily f
               set f.revokedAt = :now, f.revokeReason = :reason, f.updatedAt = :now
             where f.id = :id and f.revokedAt is null
            """)
    int revoke(
            @Param("id") long id,
            @Param("reason") RefreshTokenRevokeReason reason,
            @Param("now") LocalDateTime now
    );

    /**
     * 절대 만료가 {@code cutoff} 전인 패밀리를 최대 {@code limit}개 잠그고 식별자를 돌려준다. 폐기 여부는 보지 않는다.
     *
     * <p>잠금은 지울 때까지 같은 트랜잭션에서 유지한다. 다른 앱의 정리나 로그아웃이 먼저 잠근 행은 기다리지 않고
     * 건너뛰므로, Blue와 Green이 동시에 돌아도 서로 막지 않고 같은 행을 두 번 지우지 않는다. 패밀리를 잠그면
     * 그 패밀리를 참조하는 토큰 INSERT도 커밋까지 기다리므로 지우는 사이 토큰이 새로 붙지 않는다.
     */
    @Query(value = """
            select id
              from refresh_token_family
             where absolute_expires_at < :cutoff
             order by id
             limit :limit
               for update skip locked
            """, nativeQuery = true)
    List<Long> findExpiredIdsWithLock(@Param("cutoff") LocalDateTime cutoff, @Param("limit") int limit);

    @Modifying
    @Query("delete from RefreshTokenFamily f where f.id in :ids")
    int removeAllByIdIn(@Param("ids") Collection<Long> ids);
}
