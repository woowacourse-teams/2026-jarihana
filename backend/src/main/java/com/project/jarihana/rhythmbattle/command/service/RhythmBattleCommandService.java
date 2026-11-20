package com.project.jarihana.rhythmbattle.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythm.domain.RhythmEngine;
import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleBatchRepository;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleChatMessageRepository;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleGameRepository;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleRoomRepository;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleRunRepository;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleSeatRepository;
import com.project.jarihana.rhythmbattle.command.service.dto.RhythmBattleBatchCommand;
import com.project.jarihana.rhythmbattle.command.service.dto.RhythmBattleRunResult;
import com.project.jarihana.rhythmbattle.domain.BattleOutReason;
import com.project.jarihana.rhythmbattle.domain.BattleOutcome;
import com.project.jarihana.rhythmbattle.domain.BattleReferee;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.domain.BattleVisibility;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleBatch;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleGame;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleRoom;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleRun;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleSeat;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 대전 방의 명령을 방 잠금 안에서 처리한다. 두 사람의 판은 방 잠금으로 직렬화하므로 판을 따로 잠그지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(noRollbackFor = RhythmBattleRoomClosedException.class)
public class RhythmBattleCommandService {
    // 클라이언트가 판이 끝났다고 알린 뒤 서버 계산을 입력 없이 이어 갈 최대 시간이다.
    private static final double FINISH_SIMULATION_SECONDS = 600;
    private static final SecureRandom SEEDS = new SecureRandom();

    private final RhythmBattleRoomRepository rooms;
    private final RhythmBattleRunRepository runs;
    private final RhythmBattleBatchRepository batches;
    private final RhythmBattleGameRepository games;
    private final RhythmBattleSeatRepository seats;
    private final RhythmBattleChatMessageRepository chats;
    private final MemberRepository members;
    private final RhythmBattleTokens tokens;
    private final BattleEngineCache engines;
    private final RhythmChart chart;
    private final Clock clock;

    public long create(long memberId, BattleVisibility visibility, RhythmLevel level) {
        Member host = lockMember(memberId);
        requireFree(memberId);
        RhythmBattleRoom saved =
                rooms.saveAndFlush(RhythmBattleRoom.create(memberId, host.getCrewName(), visibility, level, now()));
        seats.saveAndFlush(RhythmBattleSeat.claim(memberId, saved.getId(), 0));
        return saved.getId();
    }

    public long join(long id, long memberId, String token) {
        Member member = lockMember(memberId);
        RhythmBattleRoom room = open(id);
        if (room.contains(memberId) && room.getStatus() != BattleRoomStatus.CLOSED) {
            return id;
        }
        requireFree(memberId);
        if (room.getVisibility() == BattleVisibility.PRIVATE && !tokens.matches(token, room.getInviteHash())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "초대 링크로 참가해 주세요.");
        }
        rooms.save(room.join(memberId, member.getCrewName(), now()));
        seats.saveAndFlush(RhythmBattleSeat.claim(memberId, id, chats.findLatestId(id)));
        return id;
    }

    public long ready(long id, long memberId, boolean ready, int gameNumber, double scrollSpeed) {
        RhythmBattleRoom room = participant(id, memberId);
        if (gameNumber != room.getGameNumber() + 1) {
            throw conflict("이전 판의 준비 요청이에요.");
        }
        rooms.save(room.ready(memberId, ready, scrollSpeed, now()));
        return id;
    }

    /**
     * 판을 시작한다. 서버가 시드와 공통 시작 시각을 정하고 두 사람의 판과 판 기록을 함께 만든다.
     */
    public long start(long id, long memberId, int gameNumber) {
        RhythmBattleRoom room = participant(id, memberId);
        if (gameNumber != room.getGameNumber() + 1) {
            throw conflict("이전 판의 시작 요청이에요.");
        }
        LocalDateTime now = now();
        RhythmBattleRoom started = rooms.save(room.start(memberId, SEEDS.nextInt(1, Integer.MAX_VALUE), now));
        for (long player : List.of(started.getHostMemberId(), started.getGuestMemberId())) {
            runs.save(RhythmBattleRun.create(id, started.getGameNumber(), player, started.getLevel(),
                    started.scrollSpeedOf(player), started.getSeed(), chart, started.getStartsAt()));
        }
        games.save(RhythmBattleGame.start(started, now));
        return id;
    }

    /**
     * 입력 묶음을 계산하고 판이 끝났는지 정한다. 이미 끝난 판이나 판이 바뀐 뒤 늦게 도착한 묶음은 계산하지 않고
     * 현재 상태를 돌려줘, 상대가 먼저 탈락해 판이 끝나는 순간에 보낸 묶음도 실패로 처리하지 않게 한다.
     */
    public RhythmBattleRunResult submit(long id, long memberId, RhythmBattleBatchCommand command) {
        LocalDateTime now = now();
        RhythmBattleRoom room = participant(id, memberId);
        RhythmBattleRun run = currentRun(room, memberId, command.gameNumber());
        if (room.getStatus() != BattleRoomStatus.PLAYING || run.isOut()
                || command.sequence() == run.getLastSequence()) {
            return new RhythmBattleRunResult(run, room);
        }
        BattleOutReason violation = run.checkBatch(command.sequence(), command.playedUntil(), command.inputs(), now);
        RhythmBattleRun next;
        if (violation != null) {
            engines.remove(run.getId());
            next = run.forfeit(violation, now);
        } else {
            RhythmBattleRun current = run;
            RhythmEngine engine = engines.take(run.getId(), run.getLastSequence()).orElseGet(() -> rebuild(current));
            engine.play(command.inputs(), command.playedUntil());
            if (command.finished() && !engine.dead()) {
                engine.playUntilDead(command.playedUntil(), command.playedUntil() + FINISH_SIMULATION_SECONDS);
            }
            batches.save(RhythmBattleBatch.of(run.getId(), command.sequence(), command.playedUntil(),
                    command.inputs(), now));
            next = run.record(command.sequence(), command.playedUntil(), command.inputs(), engine, now);
            if (next.isOut()) {
                engines.remove(run.getId());
            } else {
                engines.put(run.getId(), command.sequence(), engine);
            }
        }
        RhythmBattleRun saved = runs.save(next);
        return new RhythmBattleRunResult(saved, settle(room, now, true));
    }

    /**
     * Esc, 탭 전환이나 창 이탈로 판을 떠났다. 진행 중이면 기권으로 지고, 이미 끝났으면 현재 상태를 돌려준다.
     */
    public RhythmBattleRunResult forfeit(long id, long memberId, int gameNumber) {
        LocalDateTime now = now();
        RhythmBattleRoom room = participant(id, memberId);
        RhythmBattleRun run = currentRun(room, memberId, gameNumber);
        if (room.getStatus() != BattleRoomStatus.PLAYING || run.isOut()) {
            return new RhythmBattleRunResult(run, room);
        }
        engines.remove(run.getId());
        RhythmBattleRun saved = runs.save(run.forfeit(BattleOutReason.ABANDONED, now));
        return new RhythmBattleRunResult(saved, settle(room, now, true));
    }

    /**
     * 방을 나간다. 진행 중이면 먼저 기권으로 판을 끝내 결과를 남긴다. 방이 닫히면 남은 자리와 채팅을 지운다.
     */
    public long leave(long id, long memberId) {
        lockMember(memberId);
        RhythmBattleRoom room = lock(id);
        room.requireParticipant(memberId);
        LocalDateTime now = now();
        if (room.getStatus() == BattleRoomStatus.PLAYING) {
            RhythmBattleRun run = currentRun(room, memberId, room.getGameNumber());
            engines.remove(run.getId());
            runs.save(run.forfeit(BattleOutReason.ABANDONED, now));
            room = settle(room, now, true);
        }
        RhythmBattleRoom next = room.expire(now).leave(memberId, now);
        rooms.saveAndFlush(next);
        if (next.getStatus() == BattleRoomStatus.CLOSED) {
            release(id);
        } else {
            seats.deleteById(memberId);
        }
        return id;
    }

    public String invite(long id, long memberId) {
        RhythmBattleRoom room = participant(id, memberId);
        String raw = tokens.issue();
        rooms.save(room.invite(memberId, tokens.hash(raw), now()));
        return raw;
    }

    /**
     * 주기적인 만료 확인에서 부른다. 입력 묶음이 끊긴 판은 탈락시키고, 오래 활동이 없는 대기와 결과 방은 닫는다.
     */
    public void expire(long id) {
        rooms.lockById(id).ifPresent(room -> {
            LocalDateTime now = now();
            if (room.getStatus() == BattleRoomStatus.PLAYING) {
                settle(room, now, false);
                return;
            }
            RhythmBattleRoom next = room.expire(now);
            if (next != room) {
                rooms.saveAndFlush(next);
                if (next.getStatus() == BattleRoomStatus.CLOSED) {
                    release(id);
                }
            }
        });
    }

    /**
     * 끊긴 판을 탈락시키고 두 사람의 진행으로 승패를 정한다. 끝났으면 방과 판 기록에 결과를 남긴다.
     * 끝나지 않았으면 진행이 바뀐 경우에만 revision을 올려 실시간 연결이 상대 진행을 다시 보내게 한다.
     */
    private RhythmBattleRoom settle(RhythmBattleRoom room, LocalDateTime now, boolean changed) {
        List<RhythmBattleRun> current = new ArrayList<>();
        boolean progressed = changed;
        for (RhythmBattleRun run : runs.findByRoomIdAndGameNumber(room.getId(), room.getGameNumber())) {
            RhythmBattleRun expired = run.expire(now);
            if (expired != run) {
                engines.remove(run.getId());
                expired = runs.save(expired);
                progressed = true;
            }
            current.add(expired);
        }
        Optional<BattleOutcome> outcome = current.size() == 2
                ? BattleReferee.judge(current.get(0).progress(), current.get(1).progress())
                : Optional.empty();
        if (outcome.isEmpty()) {
            return progressed ? rooms.save(room.progressed(now)) : room;
        }
        RhythmBattleRoom finished = rooms.save(room.finish(outcome.get(), now));
        games.findByRoomIdAndGameNumber(room.getId(), room.getGameNumber())
                .ifPresent(game -> games.save(game.finish(outcome.get(), now)));
        current.forEach(run -> engines.remove(run.getId()));
        return finished;
    }

    private RhythmBattleRun currentRun(RhythmBattleRoom room, long memberId, int gameNumber) {
        if (room.getGameNumber() == 0 || gameNumber != room.getGameNumber()) {
            throw conflict("판이 바뀌었어요. 최신 상태를 확인해 주세요.");
        }
        return runs.findByRoomIdAndGameNumberAndMemberId(room.getId(), gameNumber, memberId)
                .orElseThrow(() -> conflict("판이 바뀌었어요. 최신 상태를 확인해 주세요."));
    }

    private RhythmEngine rebuild(RhythmBattleRun run) {
        RhythmEngine engine = run.newEngine(chart);
        for (RhythmBattleBatch batch : batches.findByRunIdOrderBySequence(run.getId())) {
            engine.play(batch.decodeInputs(), batch.getPlayedUntil());
        }
        return engine;
    }

    private RhythmBattleRoom participant(long id, long memberId) {
        RhythmBattleRoom room = lock(id);
        room.requireParticipant(memberId);
        return closeIdle(room);
    }

    private RhythmBattleRoom open(long id) {
        return closeIdle(lock(id));
    }

    private RhythmBattleRoom closeIdle(RhythmBattleRoom room) {
        RhythmBattleRoom next = room.expire(now());
        if (next == room) {
            return room;
        }
        rooms.saveAndFlush(next);
        release(room.getId());
        throw new RhythmBattleRoomClosedException();
    }

    private void release(long id) {
        seats.releaseRoom(id);
        chats.removeByRoomId(id);
    }

    private void requireFree(long memberId) {
        if (seats.existsById(memberId)) {
            throw conflict("이미 참여한 대전 방으로 돌아가 주세요.");
        }
    }

    private Member lockMember(long id) {
        return members.findWithLockById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 확인해 주세요."));
    }

    private RhythmBattleRoom lock(long id) {
        return rooms.lockById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RHYTHM_BATTLE_NOT_FOUND, "대전 방을 찾을 수 없어요."));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    private BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.RHYTHM_BATTLE_CONFLICT, message);
    }
}
