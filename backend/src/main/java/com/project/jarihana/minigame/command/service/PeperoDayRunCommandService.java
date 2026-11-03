package com.project.jarihana.minigame.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.minigame.command.repository.MinigameCutCommandRepository;
import com.project.jarihana.minigame.command.repository.MinigameRunCommandRepository;
import com.project.jarihana.minigame.command.service.dto.CutCommand;
import com.project.jarihana.minigame.command.service.dto.CutResult;
import com.project.jarihana.minigame.command.service.dto.StartRunResult;
import com.project.jarihana.minigame.config.PeperoDayEventProperties;
import com.project.jarihana.minigame.domain.EventStatus;
import com.project.jarihana.minigame.domain.MinigameCut;
import com.project.jarihana.minigame.domain.MinigameEvent;
import com.project.jarihana.minigame.domain.MinigameRun;
import com.project.jarihana.minigame.domain.RoundCut;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 빼빼로데이 이벤트의 순위 도전 판을 시작하고 막대를 자른다. 막대 생성과 판정은 모두 서버에서 한다.
 */
@Service
@RequiredArgsConstructor
public class PeperoDayRunCommandService {

    private static final MinigameEvent EVENT = MinigameEvent.PEPERO_DAY_2026;
    private static final SecureRandom SEEDS = new SecureRandom();

    private final MinigameRunCommandRepository minigameRunCommandRepository;
    private final MinigameCutCommandRepository minigameCutCommandRepository;
    private final MemberRepository memberRepository;
    private final PeperoDayEventProperties peperoDayEventProperties;
    private final Clock clock;

    /**
     * 같은 회원이 동시에 여러 판을 시작해도 하루 도전 횟수를 넘지 않도록 회원 행을 잠근 뒤 오늘 판 수를 센다.
     * 시작한 판은 끝내지 않아도 횟수에 들어간다.
     */
    @Transactional
    public StartRunResult start(long memberId) {
        LocalDateTime now = LocalDateTime.now(clock);
        if (peperoDayEventProperties.schedule().statusAt(now) != EventStatus.OPEN) {
            throw new BusinessException(ErrorCode.MINIGAME_EVENT_NOT_OPEN, "지금은 이벤트 기간이 아닙니다.");
        }
        Member member = memberRepository.findWithLockById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
        long used = minigameRunCommandRepository.countByEventAndMemberIdAndPlayedOn(EVENT, memberId, now.toLocalDate());
        int limit = peperoDayEventProperties.dailyAttemptLimit();
        if (used >= limit) {
            throw new BusinessException(ErrorCode.MINIGAME_ATTEMPT_LIMIT_EXCEEDED, "오늘 순위 도전을 모두 했어요.");
        }
        MinigameRun run = minigameRunCommandRepository.save(MinigameRun.start(EVENT, member, SEEDS.nextLong(), now));
        return new StartRunResult(run.getId(), run.currentRound(), run.currentPuzzle(), (int) (limit - used - 1));
    }

    /**
     * 같은 막대를 두 번 보내도 한 번만 기록되도록 판 행을 잠근 뒤 차례를 확인한다.
     * 다른 회원의 판은 없는 판과 같은 응답을 준다.
     */
    @Transactional
    public CutResult cut(CutCommand command) {
        MinigameRun run = minigameRunCommandRepository.findWithLockByIdAndMemberId(command.runId(), command.memberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.MINIGAME_RUN_NOT_FOUND, "도전 기록을 찾을 수 없습니다."));
        LocalDateTime now = LocalDateTime.now(clock);
        RoundCut cut = run.cut(command.round(), command.position(), now);
        MinigameRun saved = minigameRunCommandRepository.save(cut.run());
        minigameCutCommandRepository.save(MinigameCut.record(saved, cut, now));
        return new CutResult(cut, saved.getTotalScore(), saved.finished(), saved.finished() ? null : saved.currentPuzzle());
    }
}
