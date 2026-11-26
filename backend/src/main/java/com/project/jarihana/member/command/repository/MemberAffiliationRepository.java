package com.project.jarihana.member.command.repository;

import com.project.jarihana.member.domain.MemberAffiliation;
import com.project.jarihana.member.domain.VerifiedAffiliations;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

public interface MemberAffiliationRepository extends Repository<MemberAffiliation, Long> {

    @Query("select membership.affiliation.id from MemberAffiliation membership where membership.member.id = :memberId")
    List<Long> findAffiliationIdsByMemberId(@Param("memberId") long memberId);

    @Query("select membership.member.id from MemberAffiliation membership where membership.affiliation.id = :affiliationId")
    List<Long> findMemberIdsByAffiliationId(@Param("affiliationId") long affiliationId);

    default VerifiedAffiliations getVerifiedAffiliations(long memberId) {
        return VerifiedAffiliations.from(findAffiliationIdsByMemberId(memberId));
    }

    /**
     * 회원에게 코드로 찾은 소속을 붙인다. 이미 있으면 아무것도 하지 않아, 같은 회원의 로그인이 겹쳐도 실패하지 않는다.
     *
     * @return 새로 붙였으면 1, 이미 있었거나 그런 소속이 없으면 0
     */
    @Transactional
    @Modifying
    @Query(value = """
            insert into member_affiliation (member_id, affiliation_id, created_at, updated_at)
            select :memberId, affiliation.id, :now, :now
            from affiliation
            where affiliation.code = :code
            on conflict (member_id, affiliation_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("memberId") long memberId, @Param("code") String affiliationCode, @Param("now") LocalDateTime now);
}
