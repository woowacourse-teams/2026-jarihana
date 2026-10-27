package com.project.jarihana.proposal.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 고른 진행 방식을 선언 순서대로 쉼표로 이어 저장한다. 고르지 않았으면 빈 문자열이다.
 */
@Converter
public class ProposalMeetingModesConverter implements AttributeConverter<Set<ProposalMeetingMode>, String> {

    @Override
    public String convertToDatabaseColumn(Set<ProposalMeetingMode> meetingModes) {
        if (meetingModes == null || meetingModes.isEmpty()) {
            return "";
        }
        return EnumSet.copyOf(meetingModes).stream()
                .map(ProposalMeetingMode::name)
                .collect(Collectors.joining(","));
    }

    @Override
    public Set<ProposalMeetingMode> convertToEntityAttribute(String value) {
        if (value == null || value.isEmpty()) {
            return Collections.unmodifiableSet(EnumSet.noneOf(ProposalMeetingMode.class));
        }
        EnumSet<ProposalMeetingMode> meetingModes = EnumSet.noneOf(ProposalMeetingMode.class);
        Arrays.stream(value.split(",")).map(ProposalMeetingMode::valueOf).forEach(meetingModes::add);
        return Collections.unmodifiableSet(meetingModes);
    }
}
