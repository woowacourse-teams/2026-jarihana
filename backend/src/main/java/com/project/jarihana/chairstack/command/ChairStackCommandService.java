package com.project.jarihana.chairstack.command;

import com.project.jarihana.chairstack.command.ChairStackPlayerRepository.Player;
import com.project.jarihana.chairstack.domain.ChairStackOwner;
import com.project.jarihana.chairstack.domain.ChairStackPhysics;
import com.project.jarihana.chairstack.domain.ChairStackRules;
import com.project.jarihana.chairstack.domain.ChairStackToyRules;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import java.text.Normalizer;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ChairStackCommandService {

    private static final Pattern NICKNAME = Pattern.compile("[가-힣A-Za-z0-9 ]{2,12}");

    private final ChairStackPlayerRepository players;
    private final MemberRepository members;
    private final Clock clock;

    @Transactional
    public Player start(ChairStackOwner owner, String nickname, UUID previousRunId, UUID requestId) {
        if (owner.guest() && owner.guestDigest() == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "게임을 시작하려면 브라우저 쿠키를 허용해 주세요.");
        }
        var now = OffsetDateTime.now(clock);
        var found = players.lock(owner);
        if (found.isEmpty()) {
            if (previousRunId != null) {
                throw conflict();
            }
            String name = nickname(owner, nickname);
            if (players.create(owner, name, UUID.randomUUID(), requestId, now)) {
                return players.find(owner).orElseThrow();
            }
        }

        var player = found.orElseGet(() -> players.lock(owner).orElseThrow());
        if (requestId.equals(player.startRequestId())) {
            return player;
        }
        if (!player.run().expired(now) && !Objects.equals(previousRunId, player.run().id())) {
            throw conflict();
        }
        if (player.startedAt().plusSeconds(1).isAfter(now)) {
            throw new BusinessException(ErrorCode.CHAIR_STACK_START_TOO_SOON, "잠시 후 다시 시작해 주세요.");
        }
        players.restart(player.id(), nickname(owner, nickname), UUID.randomUUID(), requestId, now);
        return players.find(owner).orElseThrow();
    }

    @Transactional
    public Move drop(ChairStackOwner owner, UUID runId, int turn, int x, int phaseMs, Integer orientation,
                     ChairStackPhysics.Adjustment adjustment, UUID requestId) {
        var now = OffsetDateTime.now(clock);
        var player = players.lock(owner)
                .filter(found -> found.run().id().equals(runId) && !found.run().expired(now))
                .orElseThrow(() -> new BusinessException(ErrorCode.CHAIR_STACK_RUN_NOT_FOUND,
                        "이어갈 수 있는 게임을 찾지 못했어요."));
        if (requestId.equals(player.lastDropId())) {
            return new Move(player, List.of());
        }
        var run = player.run();
        if (run.finished() || turn != run.positions().size()) {
            throw conflict();
        }
        if (phaseMs >= ChairStackRules.motion(turn, run.stress()).periodMs()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "흔들림 위치가 올바르지 않아요.");
        }
        if (run.physicsMode()) {
            var result = ChairStackPhysics.drop(runId, run.physicsPoses(), x, run.physicsProfile(), adjustment);
            players.saveDrop(player, run.placePhysics(result, now), requestId);
            return new Move(players.find(owner).orElseThrow(), result.frames());
        }
        if (adjustment != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이 게임에서는 의자 방향을 조절할 수 없어요.");
        }
        if (run.toyMode()) {
            int direction = orientation == null ? ChairStackToyRules.initialOrientation(turn) : orientation;
            var drop = ChairStackToyRules.drop(run.toyPoses(), run.stress(), x, phaseMs, direction);
            players.saveDrop(player, run.placeToy(drop, now), requestId);
        } else {
            var drop = ChairStackRules.drop(run.positions(), run.stress(), x, phaseMs);
            players.saveDrop(player, run.place(drop, now), requestId);
        }
        return new Move(players.find(owner).orElseThrow(), List.of());
    }

    public record Move(Player player, List<ChairStackPhysics.Frame> frames) {
    }

    private String nickname(ChairStackOwner owner, String value) {
        if (!owner.guest()) {
            return members.findById(owner.memberId()).orElseThrow(
                    () -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원을 찾을 수 없어요.")).getCrewName();
        }
        String normalized = value == null ? "" : Normalizer.normalize(value.strip(), Normalizer.Form.NFC);
        if (!NICKNAME.matcher(normalized).matches()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "닉네임은 한글, 영문, 숫자, 공백으로 2~12자예요.");
        }
        return normalized;
    }

    private BusinessException conflict() {
        return new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "게임이 다른 화면에서 변경됐어요.");
    }
}
