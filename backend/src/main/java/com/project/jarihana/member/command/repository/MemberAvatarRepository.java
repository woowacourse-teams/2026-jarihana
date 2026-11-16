package com.project.jarihana.member.command.repository;

import com.project.jarihana.member.domain.MemberAvatar;
import org.springframework.data.repository.Repository;
import java.util.Optional;

public interface MemberAvatarRepository extends Repository<MemberAvatar, Long> {
    Optional<MemberAvatar> findById(long memberId);
    MemberAvatar save(MemberAvatar avatar);
    void deleteById(long memberId);
}
