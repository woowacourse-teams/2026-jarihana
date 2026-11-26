package com.project.jarihana.member.command.service;

import com.project.jarihana.member.command.repository.CrewRosterRepository;
import com.project.jarihana.member.command.repository.MemberAffiliationRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Affiliation;
import com.project.jarihana.member.domain.CrewRosterEntry;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/**
 * 이미 가입한 회원을 GitHub 로그인 때 크루 명단과 대조한다. 명단이 가입 뒤에 들어와도 다음 로그인에서 크루가 된다.
 *
 * <p>크루가 되면 우아한테크코스 소속도 함께 얻는다. 모임 공개 범위는 회원 유형이 아니라 이 소속으로 판정한다.
 */
@Service
public class CrewVerificationService {

    private final MemberRepository memberRepository;
    private final CrewRosterRepository crewRosterRepository;
    private final MemberAffiliationRepository memberAffiliationRepository;
    private final Clock clock;

    public CrewVerificationService(
            MemberRepository memberRepository,
            CrewRosterRepository crewRosterRepository,
            MemberAffiliationRepository memberAffiliationRepository,
            Clock clock
    ) {
        this.memberRepository = memberRepository;
        this.crewRosterRepository = crewRosterRepository;
        this.memberAffiliationRepository = memberAffiliationRepository;
        this.clock = clock;
    }

    /**
     * 기본 멤버, 부트캠프 회원, 현직자 중 명단에 있는 회원을 닉네임을 유지한 채 크루로 바꾼다.
     *
     * <p>같은 기수에 같은 닉네임의 크루가 이미 있으면 바꾸지 않는다. 코치나 다른 비크루 회원과는
     * {@code uk_member_non_crew_name} 때문에 처음부터 닉네임이 겹칠 수 없다.
     *
     * <p>이미 크루이고 명단에 있는데 소속이 없는 회원은 소속만 채운다. 소속을 모르는 이전 버전이 배포 중이나 롤백 뒤에
     * 크루로 바꾼 회원이 이 경우다. 명단 인증 전부터 있던 자가 신고 크루는 명단에 없으면 소속을 얻지 않는다.
     */
    @Transactional
    public void verifyCrew(String githubId) {
        Member member = memberRepository.findByGithubId(githubId).orElse(null);
        if (member == null) {
            return;
        }
        if (member.getMemberType() == MemberType.CREW) {
            crewRosterRepository.findByGithubId(githubId).ifPresent(entry -> grantCrewAffiliation(member));
            return;
        }
        if (!member.isCrewVerificationTarget()) {
            return;
        }
        crewRosterRepository.findByGithubId(githubId)
                .filter(entry -> isCrewNameAvailable(member, entry))
                .ifPresent(entry -> {
                    member.verifyCrew(entry.getGeneration(), entry.getCourse());
                    grantCrewAffiliation(member);
                });
    }

    /**
     * 명단으로 확인된 크루에게 우아한테크코스 소속을 붙인다. 이미 있으면 그대로 둔다.
     */
    @Transactional
    public void grantCrewAffiliation(Member member) {
        if (member.getMemberType() != MemberType.CREW) {
            throw new IllegalStateException("크루만 우아한테크코스 소속을 얻습니다.");
        }
        memberAffiliationRepository.insertIfAbsent(member.getId(), Affiliation.WOOTECO_CODE, LocalDateTime.now(clock));
    }

    private boolean isCrewNameAvailable(Member member, CrewRosterEntry entry) {
        return !memberRepository.existsByCrewNameAndGeneration(member.getCrewName(), entry.getGeneration());
    }
}
