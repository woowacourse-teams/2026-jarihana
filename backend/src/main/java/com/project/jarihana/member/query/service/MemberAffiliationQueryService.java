package com.project.jarihana.member.query.service;

import com.project.jarihana.member.query.repository.MemberQueryRepository;
import com.project.jarihana.member.query.service.dto.MemberAffiliationResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class MemberAffiliationQueryService {

    private final MemberQueryRepository memberQueryRepository;

    /**
     * 회원이 확인된 소속을 돌려준다. 소속 공개 모임을 만들거나 바꿀 때 고를 수 있는 소속이다.
     */
    public List<MemberAffiliationResult> findMyAffiliations(long memberId) {
        return memberQueryRepository.findAffiliationsByMemberId(memberId).stream()
                .map(affiliation -> new MemberAffiliationResult(affiliation.id(), affiliation.name()))
                .toList();
    }
}
