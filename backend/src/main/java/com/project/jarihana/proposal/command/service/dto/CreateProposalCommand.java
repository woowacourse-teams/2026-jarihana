package com.project.jarihana.proposal.command.service.dto;

import com.project.jarihana.proposal.domain.ProposalCategory;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public record CreateProposalCommand(
        long memberId,
        ProposalCategory category,
        String title,
        String content,
        List<String> moodOptions
) {

    /**
     * {@code List.copyOf}는 빈 원소에서 바로 예외를 던져 500이 되므로, 빈 원소도 그대로 복사해
     * 도메인 검증이 잘못된 요청으로 거부하게 한다.
     */
    public CreateProposalCommand {
        moodOptions = moodOptions == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(moodOptions));
    }
}
