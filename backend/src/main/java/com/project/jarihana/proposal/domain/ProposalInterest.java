package com.project.jarihana.proposal.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 모임 제안에 보낸 함께하고 싶어요 응답이다. 회원마다 제안 하나에 하나만 두고, 조건은 모두 비어 있어도 된다.
 * 응답을 취소하면 물리 삭제한다.
 */
@Entity
@Table(
        name = "proposal_interest",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_proposal_interest_proposal_member",
                columnNames = {"proposal_id", "member_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProposalInterest extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposal_id", nullable = false)
    private Proposal proposal;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Convert(converter = ProposalTimeSlotsConverter.class)
    @Column(name = "time_slots", nullable = false, length = 100)
    private Set<ProposalTimeSlot> timeSlots;

    @Convert(converter = ProposalMeetingModesConverter.class)
    @Column(name = "meeting_modes", nullable = false, length = 30)
    private Set<ProposalMeetingMode> meetingModes;

    @Convert(converter = ProposalMoodIndexesConverter.class)
    @Column(name = "mood_indexes", nullable = false, length = 10)
    private Set<Integer> moodIndexes;

    private ProposalInterest(
            Long id,
            Proposal proposal,
            Member member,
            Set<ProposalTimeSlot> timeSlots,
            Set<ProposalMeetingMode> meetingModes,
            Set<Integer> moodIndexes,
            LocalDateTime createdAt
    ) {
        super(require(createdAt, "응답 시각은 필수입니다."));
        this.id = id;
        this.proposal = require(proposal, "모임 제안은 필수입니다.");
        this.member = require(member, "회원은 필수입니다.");
        this.timeSlots = copyTimeSlots(timeSlots);
        this.meetingModes = copyMeetingModes(meetingModes);
        this.moodIndexes = validateMoodIndexes(proposal, moodIndexes);
    }

    public static ProposalInterest create(
            Proposal proposal,
            Member member,
            Set<ProposalTimeSlot> timeSlots,
            Set<ProposalMeetingMode> meetingModes,
            Set<Integer> moodIndexes,
            LocalDateTime createdAt
    ) {
        return new ProposalInterest(null, proposal, member, timeSlots, meetingModes, moodIndexes, createdAt);
    }

    public ProposalInterest changeConditions(
            Set<ProposalTimeSlot> timeSlots,
            Set<ProposalMeetingMode> meetingModes,
            Set<Integer> moodIndexes
    ) {
        return new ProposalInterest(id, proposal, member, timeSlots, meetingModes, moodIndexes, getCreatedAt());
    }

    private static Set<ProposalTimeSlot> copyTimeSlots(Set<ProposalTimeSlot> timeSlots) {
        if (timeSlots == null || timeSlots.isEmpty()) {
            return Collections.unmodifiableSet(EnumSet.noneOf(ProposalTimeSlot.class));
        }
        if (timeSlots.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "가능한 시간을 다시 골라 주세요.");
        }
        return Collections.unmodifiableSet(EnumSet.copyOf(timeSlots));
    }

    private static Set<ProposalMeetingMode> copyMeetingModes(Set<ProposalMeetingMode> meetingModes) {
        if (meetingModes == null || meetingModes.isEmpty()) {
            return Collections.unmodifiableSet(EnumSet.noneOf(ProposalMeetingMode.class));
        }
        if (meetingModes.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "진행 방식을 다시 골라 주세요.");
        }
        return Collections.unmodifiableSet(EnumSet.copyOf(meetingModes));
    }

    private static Set<Integer> validateMoodIndexes(Proposal proposal, Set<Integer> moodIndexes) {
        if (moodIndexes == null || moodIndexes.isEmpty()) {
            return Collections.unmodifiableSet(new TreeSet<>());
        }
        boolean allExist = moodIndexes.stream().allMatch(index -> index != null && proposal.hasMoodOption(index));
        if (!allExist) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "제안에 없는 분위기 선택지입니다.");
        }
        return Collections.unmodifiableSet(new TreeSet<>(moodIndexes));
    }

    private static <T> T require(T value, String message) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, message);
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public Proposal getProposal() {
        return proposal;
    }

    public Member getMember() {
        return member;
    }

    public Set<ProposalTimeSlot> getTimeSlots() {
        return timeSlots;
    }

    public Set<ProposalMeetingMode> getMeetingModes() {
        return meetingModes;
    }

    public Set<Integer> getMoodIndexes() {
        return moodIndexes;
    }
}
