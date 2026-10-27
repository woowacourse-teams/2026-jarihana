package com.project.jarihana.proposal.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 고른 시간을 선언 순서대로 쉼표로 이어 저장한다. 고르지 않았으면 빈 문자열이다.
 */
@Converter
public class ProposalTimeSlotsConverter implements AttributeConverter<Set<ProposalTimeSlot>, String> {

    @Override
    public String convertToDatabaseColumn(Set<ProposalTimeSlot> timeSlots) {
        if (timeSlots == null || timeSlots.isEmpty()) {
            return "";
        }
        return EnumSet.copyOf(timeSlots).stream()
                .map(ProposalTimeSlot::name)
                .collect(Collectors.joining(","));
    }

    @Override
    public Set<ProposalTimeSlot> convertToEntityAttribute(String value) {
        if (value == null || value.isEmpty()) {
            return Collections.unmodifiableSet(EnumSet.noneOf(ProposalTimeSlot.class));
        }
        EnumSet<ProposalTimeSlot> timeSlots = EnumSet.noneOf(ProposalTimeSlot.class);
        Arrays.stream(value.split(",")).map(ProposalTimeSlot::valueOf).forEach(timeSlots::add);
        return Collections.unmodifiableSet(timeSlots);
    }
}
