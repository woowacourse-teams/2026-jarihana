package com.project.jarihana.member.query.repository;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.member.domain.MemberAvatar;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import java.util.Optional;

public interface MemberAvatarQueryRepository extends Repository<MemberAvatar, Long> {
    @Query("select a.appearance from MemberAvatar a where a.id = :memberId")
    Optional<AvatarAppearance> findAppearanceByMemberId(long memberId);
}
