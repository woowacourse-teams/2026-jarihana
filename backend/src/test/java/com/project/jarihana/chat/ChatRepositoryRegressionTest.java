package com.project.jarihana.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.chat.command.repository.ChatCommandRepository;
import com.project.jarihana.chat.command.service.ChatCommandService;
import com.project.jarihana.chat.query.repository.ChatQueryRepository;
import com.project.jarihana.chat.query.service.ChatQueryService;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.UUID;

class ChatRepositoryRegressionTest extends NotificationIntegrationTestSupport {
    @Autowired ChatCommandRepository commandRepository;
    @Autowired ChatQueryRepository queryRepository;
    @Autowired ChatCommandService commands;
    @Autowired ChatQueryService queries;
    @Autowired PlatformTransactionManager transactions;

    @Test
    @DisplayName("저장 결과와 재조회는 DB에 저장된 마이크로초 시각과 작성자를 반환한다")
    void saveAndReloadReturnDatabaseTimestampAndAuthor() {
        // Given
        Member owner = member("301");
        Group group = room(owner, "시각 확인");
        UUID request = UUID.randomUUID();
        LocalDateTime time = NOW.withNano(123456789);

        // When
        var saved =
                new TransactionTemplate(transactions)
                        .execute(
                                status -> {
                                    commandRepository.lockGroup(group.getId());
                                    commandRepository.requireMember(group.getId(), owner.getId());
                                    return commandRepository.save(
                                            group.getId(), owner.getId(), request, "저장", time);
                                });
        var reloaded = queryRepository.findMessage(saved.id());

        // Then
        assertThat(saved.createdAt()).isEqualTo(NOW.withNano(123457000));
        assertThat(reloaded.createdAt()).isEqualTo(saved.createdAt());
        assertThat(saved.author()).isEqualTo(owner.getCrewName());
        assertThat(reloaded.author()).isEqualTo(owner.getCrewName());
        assertThat(reloaded.clientMessageId()).isEqualTo(request);
    }

    @Test
    @DisplayName("작성자 이름 변경은 중복 전송 응답과 이력 및 목록에 반영된다")
    void renamedAuthorAppearsInRetryHistoryAndRoomList() {
        // Given
        Member owner = member("302");
        Group group = room(owner, "작성자 확인");
        UUID request = UUID.randomUUID();
        commands.sendMessage(owner.getId(), group.getId(), request, "이름 확인");
        jdbc.update("update member set crew_name = ? where id = ?", "새이름", owner.getId());

        // When
        var retried = commands.sendMessage(owner.getId(), group.getId(), request, "이름 확인");
        var history = queries.history(owner.getId(), group.getId(), null, null, 20);
        var rooms = queries.rooms(owner.getId(), null, 20, "");

        // Then
        assertThat(retried.created()).isFalse();
        assertThat(retried.message().author()).isEqualTo("새이름");
        assertThat(history.items().getFirst().author()).isEqualTo("새이름");
        assertThat(rooms.items().getFirst().lastMessage().author()).isEqualTo("새이름");
    }

    @Test
    @DisplayName("탈퇴 회원은 전송과 목록 및 전달 대상에서 제외되고 과거 메시지는 남는다")
    void withdrawnMemberIsExcludedWithoutHidingPastMessages() {
        // Given
        Member owner = member("303");
        Member other = member("304");
        Group group = room(owner, "탈퇴 확인");
        groupMembers.save(GroupMember.createMember(group, other, NOW));
        commands.sendMessage(other.getId(), group.getId(), UUID.randomUUID(), "기록");
        jdbc.update("update member set withdrawn_at = ? where id = ?", NOW, other.getId());

        // When / Then
        assertThat(queryRepository.members(group.getId())).containsExactly(owner.getId());
        assertThat(queries.rooms(other.getId(), null, 20, "").items()).isEmpty();
        assertThatThrownBy(
                        () ->
                                commands.sendMessage(
                                        other.getId(), group.getId(), UUID.randomUUID(), "금지"))
                .isInstanceOf(BusinessException.class);
        assertThat(queries.history(owner.getId(), group.getId(), null, null, 20).items())
                .hasSize(1);
    }

    @Test
    @DisplayName("빈 모임은 같은 시각에도 ID 커서로 나뉘고 검색 특수문자는 문자 그대로 찾는다")
    void emptyRoomsUseIdCursorAndLiteralSearch() {
        // Given
        Member owner = member("305");
        Group first = room(owner, "스터디_첫번째");
        Group second = room(owner, "스터디%두번째");

        // When
        var latest = queries.rooms(owner.getId(), null, 1, "");
        var previous = queries.rooms(owner.getId(), latest.nextCursor(), 1, "");

        // Then
        assertThat(latest.items().getFirst().groupId()).isEqualTo(second.getId());
        assertThat(latest.items().getFirst().lastMessage()).isNull();
        assertThat(previous.items().getFirst().groupId()).isEqualTo(first.getId());
        assertThat(queries.rooms(owner.getId(), null, 20, "%").items())
                .extracting(room -> room.groupId())
                .containsExactly(second.getId());
        assertThat(queries.rooms(owner.getId(), null, 20, "_").items())
                .extracting(room -> room.groupId())
                .containsExactly(first.getId());
    }

    @Test
    @DisplayName("다음 페이지의 모임에 새 메시지가 와도 목록에서 누락되지 않는다")
    void newMessageDoesNotMoveRoomAcrossPaginationBoundary() {
        // Given
        Member owner = member("306");
        Group older = room(owner, "이전 모임");
        Group newer = room(owner, "최근 모임");
        jdbc.update(
                "update groups set created_at = ? where id = ?", NOW.minusDays(2), older.getId());
        jdbc.update(
                "update groups set created_at = ? where id = ?", NOW.minusDays(1), newer.getId());
        var first = queries.rooms(owner.getId(), null, 1, "");
        assertThat(first.items().getFirst().groupId()).isEqualTo(newer.getId());

        // When
        var message = commands.sendMessage(owner.getId(), older.getId(), UUID.randomUUID(), "새 대화");
        var second = queries.rooms(owner.getId(), first.nextCursor(), 1, "");

        // Then
        assertThat(second.items())
                .extracting(room -> room.groupId())
                .containsExactly(older.getId());
        assertThat(second.items().getFirst().updatedAt()).isEqualTo(message.message().createdAt());
        assertThat(second.hasNext()).isFalse();
    }

    private Group room(Member owner, String name) {
        Group group = groups.save(Group.createClub(name, "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        return group;
    }
}
