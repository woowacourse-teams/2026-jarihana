package com.project.jarihana.auth.command.repository;

import com.project.jarihana.auth.domain.RefreshToken;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends Repository<RefreshToken, Long> {

    RefreshToken save(RefreshToken refreshToken);

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    void delete(RefreshToken refreshToken);

    List<RefreshToken> findAll();
}
