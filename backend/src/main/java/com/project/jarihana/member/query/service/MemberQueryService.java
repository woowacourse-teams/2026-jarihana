package com.project.jarihana.member.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.query.repository.MemberQueryRepository;
import com.project.jarihana.member.query.repository.dto.MemberProfileProjection;
import com.project.jarihana.member.query.service.dto.MemberProfileResult;
import com.project.jarihana.member.query.service.dto.MyProfileQuery;
import com.project.jarihana.member.query.service.dto.MyProfileResult;
import org.springframework.stereotype.Service;

@Service
public class MemberQueryService {

    private static final String UNAUTHENTICATED_MESSAGE = "인증 정보가 필요합니다.";

    private final MemberQueryRepository memberQueryRepository;

    public MemberQueryService(MemberQueryRepository memberQueryRepository) {
        this.memberQueryRepository = memberQueryRepository;
    }

    /**
     * 가입을 마친 회원과 GitHub 인증만 끝낸 사용자를 함께 처리한다.
     *
     * <p>Access Token은 가입을 마친 회원에게만 발급하므로 회원 식별자가 있으면 가입 완료로 본다.
     * 가입 세션만 있으면 아직 회원이 아니므로 가입 전 상태를 돌려준다. 둘 다 없으면 거부한다.
     */
    public MyProfileResult findMyProfile(MyProfileQuery query) {
        if (query.memberId() != null) {
            return memberQueryRepository.findProfileById(query.memberId())
                    .map(MemberQueryService::toResult)
                    .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED, UNAUTHENTICATED_MESSAGE));
        }
        if (query.signupGithubId() != null) {
            return MyProfileResult.signupRequired();
        }
        throw new BusinessException(ErrorCode.UNAUTHENTICATED, UNAUTHENTICATED_MESSAGE);
    }

    private static MyProfileResult toResult(MemberProfileProjection projection) {
        return MyProfileResult.signupCompleted(new MemberProfileResult(
                projection.id(),
                projection.crewName(),
                projection.generation(),
                projection.course(),
                projection.githubId()
        ));
    }
}
