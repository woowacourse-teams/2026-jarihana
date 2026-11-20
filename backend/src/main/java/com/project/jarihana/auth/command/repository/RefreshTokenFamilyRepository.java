package com.project.jarihana.auth.command.repository;

import com.project.jarihana.auth.domain.RefreshTokenFamily;
import com.project.jarihana.auth.domain.RefreshTokenRevokeReason;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

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
}
