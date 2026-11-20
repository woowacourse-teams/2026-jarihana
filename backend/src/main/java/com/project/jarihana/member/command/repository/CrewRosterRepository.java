package com.project.jarihana.member.command.repository;

import com.project.jarihana.member.domain.CrewRosterEntry;
import org.springframework.data.repository.Repository;

import java.util.Optional;

/**
 * 명단은 운영자가 직접 적재하므로 애플리케이션은 조회만 한다.
 */
public interface CrewRosterRepository extends Repository<CrewRosterEntry, Long> {

    Optional<CrewRosterEntry> findByGithubId(String githubId);
}
