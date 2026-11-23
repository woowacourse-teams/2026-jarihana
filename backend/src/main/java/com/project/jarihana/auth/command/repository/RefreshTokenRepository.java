package com.project.jarihana.auth.command.repository;

import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.domain.RefreshTokenFamily;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Optional;

public interface RefreshTokenRepository extends Repository<RefreshToken, Long> {

    RefreshToken save(RefreshToken refreshToken);

    /**
     * 갱신은 패밀리의 폐기와 절대 만료를 함께 보므로 패밀리까지 한 번에 가져온다.
     */
    @Query("select t from RefreshToken t left join fetch t.family where t.tokenHash = :tokenHash")
    Optional<RefreshToken> findByTokenHash(@Param("tokenHash") String tokenHash);

    void delete(RefreshToken refreshToken);

    /**
     * 활성 토큰일 때만 회전 시각을 기록하고 바뀐 행 수를 돌려준다. 같은 토큰으로 동시에 온 요청 중 1을 받은
     * 하나만 새 토큰을 발급한다. READ COMMITTED에서 두 번째 UPDATE는 첫 번째 커밋을 기다린 뒤 조건을 다시
     * 평가해 0행을 바꾼다.
     *
     * <p>만료도 유예 끝으로 당긴다. 회전을 모르는 이전 버전으로 롤백해도 회전된 토큰을 받아 주지 않게 한다.
     */
    @Modifying
    @Query("""
            update RefreshToken t
               set t.rotatedAt = :now, t.expiresAt = :replayableUntil, t.updatedAt = :now
             where t.id = :id and t.rotatedAt is null
            """)
    int markRotated(
            @Param("id") long id,
            @Param("now") LocalDateTime now,
            @Param("replayableUntil") LocalDateTime replayableUntil
    );

    /**
     * 회전 UPDATE가 0행을 바꾼 뒤 그 이유를 가린다. 엔티티 조회는 영속성 컨텍스트의 옛 상태를 돌려주므로
     * 커밋된 행을 직접 확인한다.
     */
    boolean existsByIdAndRotatedAtIsNotNull(long id);

    /**
     * 패밀리 없이 저장된 이전 행을 처음 회전할 때 패밀리에 넣는다. 회전에 성공한 요청만 부른다.
     */
    @Modifying
    @Query("update RefreshToken t set t.family = :family, t.updatedAt = :now where t.id = :id")
    int attachFamily(
            @Param("id") long id,
            @Param("family") RefreshTokenFamily family,
            @Param("now") LocalDateTime now
    );

    /**
     * 폐기한 패밀리의 토큰을 지운다. 이전 버전은 패밀리의 폐기 여부를 읽지 않으므로, 행이 남으면 롤백한
     * 이전 버전이 폐기된 토큰을 받아 준다.
     */
    @Modifying
    @Query("delete from RefreshToken t where t.family.id = :familyId")
    int removeAllByFamilyId(@Param("familyId") long familyId);

    /**
     * 정리할 패밀리의 토큰을 지운다. 패밀리 행보다 먼저 지워야 외래 키에 걸리지 않는다.
     */
    @Modifying
    @Query("delete from RefreshToken t where t.family.id in :familyIds")
    int removeAllByFamilyIdIn(@Param("familyIds") Collection<Long> familyIds);

    /**
     * 패밀리 없이 저장된 이전 행 중 {@code cutoff} 전에 만료된 행을 최대 {@code limit}개 지운다. 다른 앱이 같은
     * 행을 지우는 중이면 기다리지 않고 건너뛴다.
     */
    @Modifying
    @Query(value = """
            delete from refresh_token
             where id in (
                   select id
                     from refresh_token
                    where refresh_token_family_id is null
                      and expires_at < :cutoff
                    order by id
                    limit :limit
                      for update skip locked)
            """, nativeQuery = true)
    int removeExpiredWithoutFamily(@Param("cutoff") LocalDateTime cutoff, @Param("limit") int limit);
}
