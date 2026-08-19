package com.project.jarihana.auth.command.repository;

import com.project.jarihana.auth.domain.RefreshToken;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface RefreshTokenRepository extends Repository<RefreshToken, Long> {

    RefreshToken save(RefreshToken refreshToken);

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    List<RefreshToken> findAll();
}
