package com.project.jarihana.member.command.service;

import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.command.service.dto.MemberSignupCommand;
import com.project.jarihana.member.command.service.dto.MemberSignupCommand.BootcampCommand;
import com.project.jarihana.member.command.service.dto.MemberSignupCommand.CompanyCommand;
import com.project.jarihana.member.command.service.dto.MemberSignupResult;
import com.project.jarihana.member.domain.Bootcamp;
import com.project.jarihana.member.domain.Company;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberCommandService {

    private static final String SIGNUP_SESSION_MESSAGE = "가입 절차를 다시 시작해 주세요.";
    private static final String ALREADY_EXISTS_MESSAGE = "이미 가입한 사용자입니다.";
    private static final String CREW_DUPLICATED_MESSAGE = "이미 사용 중인 크루명입니다.";

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
        Member member = createMember(command, githubId);
        validateCrewNameAvailable(member);

        member = memberRepository.save(member);
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

    private static Member createMember(MemberSignupCommand command, String githubId) {
        MemberType memberType = command.memberType();
        if (memberType == MemberType.BOOTCAMP) {
            return Member.createBootcamp(command.crewName(), githubId, toBootcamp(command.bootcamp()), command.field());
        }
        if (memberType == MemberType.PROFESSIONAL) {
            return Member.createProfessional(
                    command.crewName(), githubId, command.field(), command.career(), toCompany(command.company())
            );
        }
        return Member.create(command.crewName(), command.generation(), githubId, memberType, command.course());
    }

    private static Bootcamp toBootcamp(BootcampCommand bootcamp) {
        if (bootcamp == null) {
            return null;
        }
        return Bootcamp.of(bootcamp.name(), bootcamp.status(), bootcamp.cohort());
    }

    private static Company toCompany(CompanyCommand company) {
        if (company == null) {
            return null;
        }
        if (company.visible() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "회사명 공개 여부는 필수입니다.");
        }
        return Company.of(company.name(), company.visible());
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
     * 크루는 같은 기수 안에서, 코치는 모든 회원과, 부트캠프 회원과 현직자는 기수가 없는 회원(코치 포함)끼리 닉네임이 겹치면 안 된다.
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
