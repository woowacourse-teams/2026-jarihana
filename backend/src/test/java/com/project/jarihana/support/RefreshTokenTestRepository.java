package com.project.jarihana.support;

import com.project.jarihana.auth.domain.RefreshToken;
import org.springframework.data.repository.Repository;

import java.util.List;

/**
 * 인수 테스트가 Refresh Token 저장 결과를 확인한다.
 *
 * <p>프로덕션 {@code RefreshTokenRepository}는 좁은 {@code Repository}를 상속해 실제로 쓰는
 * 메서드만 노출한다. 검증용 {@code findAll}을 그쪽에 두면 프로덕션이 부르지 않는 메서드가
 * 남으므로 이곳으로 분리한다.
 */
public interface RefreshTokenTestRepository extends Repository<RefreshToken, Long> {

    List<RefreshToken> findAll();
}
