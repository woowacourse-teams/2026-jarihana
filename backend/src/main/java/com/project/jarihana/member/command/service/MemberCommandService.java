package com.project.jarihana.member.command.service;

import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.CrewRosterRepository;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.command.service.dto.MemberSignupCommand;
import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.points.command.service.PointRewardService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberCommandService {

    private static final String SIGNUP_SESSION_MESSAGE = "가입 절차를 다시 시작해 주세요.";
    private static final String ALREADY_EXISTS_MESSAGE = "이미 가입한 사용자입니다.";
    private static final String CREW_DUPLICATED_MESSAGE = "이미 사용 중인 크루명입니다.";

    private final MemberRepository memberRepository;
    private final CrewRosterRepository crewRosterRepository;
    private final AccessTokenProvider accessTokenProvider;
    private final RefreshTokenIssuer refreshTokenIssuer;
    private final PointRewardService pointRewards;

    public MemberCommandService(
            MemberRepository memberRepository,
            CrewRosterRepository crewRosterRepository,
            AccessTokenProvider accessTokenProvider,
            RefreshTokenIssuer refreshTokenIssuer,
            PointRewardService pointRewards
    ) {
        this.memberRepository = memberRepository;
        this.crewRosterRepository = crewRosterRepository;
        this.accessTokenProvider = accessTokenProvider;
        this.refreshTokenIssuer = refreshTokenIssuer;
        this.pointRewards = pointRewards;
    }

    /**
     * 가입 세션의 githubId로 회원을 만들고 이후 API에서 쓸 토큰을 발급한다.
     *
     * <p>회원 저장, 가입 보상 예약과 Refresh Token 발급을 하나의 트랜잭션으로 묶는다.
     */
    @Transactional
    public MemberSignupResult signup(MemberSignupCommand command) {
        String githubId = requireSignupSession(command.githubId());
        validateNotRegistered(githubId);
        Member member = createMember(command, githubId);
        validateCrewNameAvailable(member);

        member = memberRepository.save(member);
        pointRewards.memberSignedUp(member.getId());
        return new MemberSignupResult(
                member.getId(),
                member.getCrewName(),
                member.getGeneration(),
                member.getMemberType(),
                member.getCourse(),
                member.getBootcamp(),
                member.getField(),
                member.getCareer(),
                member.getCompany(),
                member.getJoinedAt(),
                accessTokenProvider.issue(member.getId()),
                refreshTokenIssuer.issue(member)
        );
    }

    /**
     * 코치는 요청한 대로 만들고, 그 밖에는 크루 명단에 있으면 명단의 기수와 과정으로 크루를, 없으면 기본 멤버를 만든다.
     * 요청에 담긴 크루 기수, 과정, 소속 정보는 쓰지 않는다.
     */
    private Member createMember(MemberSignupCommand command, String githubId) {
        if (command.memberType() == MemberType.COACH) {
            return Member.create(command.crewName(), null, githubId, MemberType.COACH, null);
        }
        return crewRosterRepository.findByGithubId(githubId)
                .map(entry -> Member.create(command.crewName(), entry.getGeneration(), githubId, entry.getCourse()))
                .orElseGet(() -> Member.createBasic(command.crewName(), githubId));
    }

    private String requireSignupSession(String githubId) {
        if (githubId == null || githubId.isBlank()) {
            throw new BusinessException(ErrorCode.SIGNUP_SESSION_REQUIRED, SIGNUP_SESSION_MESSAGE);
        }
        return githubId;
    }

    private void validateNotRegistered(String githubId) {
        if (memberRepository.existsByGithubId(githubId)) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_EXISTS, ALREADY_EXISTS_MESSAGE);
        }
    }

    private void validateCrewNameAvailable(Member member) {
        if (isCrewNameTaken(member)) {
            throw new BusinessException(ErrorCode.MEMBER_CREW_DUPLICATED, CREW_DUPLICATED_MESSAGE);
        }
    }

    /**
     * 크루는 같은 기수 안에서, 코치는 모든 회원과, 기본 멤버는 기수가 없는 회원(코치 포함)끼리 닉네임이 겹치면 안 된다.
     */
    private boolean isCrewNameTaken(Member member) {
        String crewName = member.getCrewName();
        if (member.getMemberType() == MemberType.CREW) {
            return memberRepository.existsByCrewNameAndGeneration(crewName, member.getGeneration())
                    || memberRepository.existsByCrewNameAndMemberType(crewName, MemberType.COACH);
        }
        if (member.getMemberType() == MemberType.COACH) {
            return memberRepository.existsByCrewName(crewName);
        }
        return memberRepository.existsByCrewNameAndMemberTypeNot(crewName, MemberType.CREW);
    }
}
