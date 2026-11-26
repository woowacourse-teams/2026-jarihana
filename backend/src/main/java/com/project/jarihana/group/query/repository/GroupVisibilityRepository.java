package com.project.jarihana.group.query.repository;

import com.project.jarihana.group.domain.Group;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * 조회자에게 모임이 보이는지 판단한다.
 *
 * <p>비공개 모임은 현재 구성원에게 보이고 소속 공개 모임은 그 소속의 회원에게도 보인다. 숨김 조건은 {@link #HIDDEN_FROM_VIEWER} 한 곳에
 * 두고, 경로 변수로 모임을 찾는 판정은 모두 이 조건을 쓴다. 보이지 않는 모임은 호출하는 쪽이 없는 자원과 같은
 * 404로 응답한다. {@code viewerId}가 {@code null}이면 비로그인 조회자다. 없는 자원은 숨긴 것으로 보지 않아,
 * 없을 때의 응답은 각 컨트롤러가 정한다.
 */
public interface GroupVisibilityRepository extends Repository<Group, Long> {

    /**
     * 별칭 {@code g}인 모임이 {@code :viewerId}에게 보이지 않는 조건.
     */
    String HIDDEN_FROM_VIEWER = """
            g.visibility <> com.project.jarihana.group.domain.GroupVisibility.PUBLIC
            and not (
                g.visibility = com.project.jarihana.group.domain.GroupVisibility.AFFILIATION_ONLY
                and exists (
                    select viewerAffiliation.id from MemberAffiliation viewerAffiliation
                    where viewerAffiliation.member.id = :viewerId
                      and viewerAffiliation.affiliation.id = g.visibleAffiliationId
                )
            )
            and not exists (
                select membership.id from GroupMember membership
                where membership.group = g
                  and membership.member.id = :viewerId
            )
            """;

    @Query("select count(g.id) > 0 from Group g where g.id = :groupId and not (" + HIDDEN_FROM_VIEWER + ")")
    boolean existsVisibleById(@Param("groupId") long groupId, @Param("viewerId") Long viewerId);

    @Query("select affiliation.name from Affiliation affiliation where affiliation.id = :affiliationId")
    Optional<String> findAffiliationNameById(@Param("affiliationId") long affiliationId);

    @Query("select count(g.id) > 0 from Group g where g.id = :groupId and " + HIDDEN_FROM_VIEWER)
    boolean isGroupHidden(@Param("groupId") long groupId, @Param("viewerId") Long viewerId);

    @Query("""
            select count(recruitment.id) > 0
            from GroupRecruitment recruitment join recruitment.group g
            where recruitment.id = :recruitmentId and
            """ + HIDDEN_FROM_VIEWER)
    boolean isRecruitmentHidden(@Param("recruitmentId") long recruitmentId, @Param("viewerId") Long viewerId);

    @Query("""
            select count(post.id) > 0
            from ActivityPost post join post.group g
            where post.id = :postId and
            """ + HIDDEN_FROM_VIEWER)
    boolean isActivityPostHidden(@Param("postId") long postId, @Param("viewerId") Long viewerId);

    @Query("""
            select count(comment.id) > 0
            from ActivityPostComment comment join comment.post post join post.group g
            where comment.id = :commentId and
            """ + HIDDEN_FROM_VIEWER)
    boolean isActivityPostCommentHidden(@Param("commentId") long commentId, @Param("viewerId") Long viewerId);

    @Query("""
            select count(invitation.id) > 0
            from Invitation invitation join invitation.group g
            where invitation.id = :invitationId
              and not (
                  g.visibility = com.project.jarihana.group.domain.GroupVisibility.PRIVATE
                  and (
                      (invitation.type = com.project.jarihana.invitation.domain.InvitationType.DIRECT
                          and coalesce(invitation.targetMember.id = :viewerId, false))
                      or (:linkAcceptance = true
                          and invitation.type = com.project.jarihana.invitation.domain.InvitationType.LINK)
                  )
              )
              and
            """ + HIDDEN_FROM_VIEWER)
    boolean isInvitationHidden(
            @Param("invitationId") long invitationId,
            @Param("viewerId") Long viewerId,
            @Param("linkAcceptance") boolean linkAcceptance
    );
}
