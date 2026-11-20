package com.project.jarihana.member.command.service;

import com.project.jarihana.member.command.repository.CrewRosterRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.CrewRosterEntry;
import com.project.jarihana.member.domain.Member;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이미 가입한 회원을 GitHub 로그인 때 크루 명단과 대조한다. 명단이 가입 뒤에 들어와도 다음 로그인에서 크루가 된다.
 */
@Service
public class CrewVerificationService {

    private final MemberRepository memberRepository;
    private final CrewRosterRepository crewRosterRepository;

    public CrewVerificationService(MemberRepository memberRepository, CrewRosterRepository crewRosterRepository) {
        this.memberRepository = memberRepository;
        this.crewRosterRepository = crewRosterRepository;
    }

    /**
     * 기본 멤버, 부트캠프 회원, 현직자 중 명단에 있는 회원을 닉네임을 유지한 채 크루로 바꾼다.
     *
     * <p>같은 기수에 같은 닉네임의 크루가 이미 있으면 바꾸지 않는다. 코치나 다른 비크루 회원과는
     * {@code uk_member_non_crew_name} 때문에 처음부터 닉네임이 겹칠 수 없다.
     */
    @Transactional
    public void verifyCrew(String githubId) {
        Member member = memberRepository.findByGithubId(githubId).orElse(null);
        if (member == null || !member.isCrewVerificationTarget()) {
            return;
        }
        crewRosterRepository.findByGithubId(githubId)
                .filter(entry -> isCrewNameAvailable(member, entry))
                .ifPresent(entry -> member.verifyCrew(entry.getGeneration(), entry.getCourse()));
    }

    private boolean isCrewNameAvailable(Member member, CrewRosterEntry entry) {
        return !memberRepository.existsByCrewNameAndGeneration(member.getCrewName(), entry.getGeneration());
    }
}
