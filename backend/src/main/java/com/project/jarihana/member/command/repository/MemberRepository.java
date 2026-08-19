package com.project.jarihana.member.command.repository;

import com.project.jarihana.member.domain.Member;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface MemberRepository extends Repository<Member, Long> {

    Member save(Member member);

    Optional<Member> findById(Long id);

    Optional<Member> findByGithubId(String githubId);
}
