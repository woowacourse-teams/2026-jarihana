package com.project.jarihana.member.command.repository;

import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface MemberRepository extends Repository<Member, Long> {

    Member save(Member member);

    Optional<Member> findById(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Member> findWithLockById(long id);

    Optional<Member> findByGithubId(String githubId);

    boolean existsByGithubId(String githubId);

    boolean existsByCrewNameAndGeneration(String crewName, Integer generation);

    boolean existsByCrewName(String crewName);

    boolean existsByCrewNameAndMemberType(String crewName, MemberType memberType);
}
