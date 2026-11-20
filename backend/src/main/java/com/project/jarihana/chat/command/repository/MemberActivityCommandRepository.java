package com.project.jarihana.chat.command.repository;

import com.project.jarihana.member.domain.Member;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface MemberActivityCommandRepository extends Repository<Member, Long> {
    @Modifying
    @Query(
            value = """
                    insert into member_activity (member_id, last_active_at)
                    select id, :lastActiveAt from member
                    where id = :memberId and withdrawn_at is null
                    on conflict (member_id) do update
                    set last_active_at = greatest(member_activity.last_active_at, excluded.last_active_at)
                    where member_activity.last_active_at < excluded.last_active_at
                    """,
            nativeQuery = true)
    int updateIfNewer(
            @Param("memberId") long memberId, @Param("lastActiveAt") LocalDateTime lastActiveAt);
}
