package com.project.jarihana.member.command.service;

import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.command.service.dto.MemberSignupCommand;
import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import com.project.jarihana.member.domain.Member;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberCommandService {

    private static final String SIGNUP_SESSION_MESSAGE = "가입 절차를 다시 시작해 주세요.";
    private static final String ALREADY_EXISTS_MESSAGE = "이미 가입한 사용자입니다.";
    private static final String CREW_DUPLICATED_MESSAGE = "같은 기수에 이미 사용 중인 크루명입니다.";

    private final MemberRepository memberRepository;
    private final AccessTokenProvider accessTokenProvider;
    private final RefreshTokenIssuer refreshTokenIssuer;

    public MemberCommandService(
            MemberRepository memberRepository,
            AccessTokenProvider accessTokenProvider,
            RefreshTokenIssuer refreshTokenIssuer
    ) {
        this.memberRepository = memberRepository;
        this.accessTokenProvider = accessTokenProvider;
        this.refreshTokenIssuer = refreshTokenIssuer;
    }

    /**
     * 가입 세션의 githubId로 회원을 만들고 이후 API에서 쓸 토큰을 발급한다.
     *
     * <p>회원 저장과 Refresh Token 발급이 함께 성립해야 하므로 하나의 트랜잭션으로 묶는다.
     */
    @Transactional
    public MemberSignupResult signup(MemberSignupCommand command) {
        String githubId = requireSignupSession(command.githubId());
        validateNotRegistered(githubId);
        validateCrewNameAvailable(command.crewName(), command.generation());

        Member member = memberRepository.save(
                Member.create(command.crewName(), command.generation(), githubId, command.course())
        );
        return new MemberSignupResult(
                member.getId(),
                member.getCrewName(),
                member.getGeneration(),
                member.getCourse(),
                member.getJoinedAt(),
                accessTokenProvider.issue(member.getId()),
                refreshTokenIssuer.issue(member)
        );
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

    private void validateCrewNameAvailable(String crewName, int generation) {
        if (memberRepository.existsByCrewNameAndGeneration(crewName, generation)) {
            throw new BusinessException(ErrorCode.MEMBER_CREW_DUPLICATED, CREW_DUPLICATED_MESSAGE);
        }
    }
}
