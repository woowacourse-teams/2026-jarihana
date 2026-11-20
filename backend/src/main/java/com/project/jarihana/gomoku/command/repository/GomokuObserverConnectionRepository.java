package com.project.jarihana.gomoku.command.repository;

import com.project.jarihana.gomoku.domain.GomokuObserverConnection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.UUID;

public interface GomokuObserverConnectionRepository extends JpaRepository<GomokuObserverConnection, Long> {
    @Modifying
    @Query("update GomokuObserverConnection c set c.expiresAt=:expiresAt where c.connectionId=:connectionId")
    int renew(UUID connectionId, LocalDateTime expiresAt);

    @Modifying
    @Query("delete from GomokuObserverConnection c where c.connectionId=:connectionId")
    void removeConnection(UUID connectionId);

    @Modifying
    @Query("delete from GomokuObserverConnection c where c.observationId=:observationId")
    void removeObservation(long observationId);

    @Modifying
    @Query("delete from GomokuObserverConnection c where c.expiresAt<=:now")
    void removeExpired(LocalDateTime now);
}
