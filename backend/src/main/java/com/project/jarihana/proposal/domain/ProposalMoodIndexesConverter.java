package com.project.jarihana.proposal.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 고른 분위기 선택지의 순번을 오름차순으로 쉼표로 이어 저장한다. 고르지 않았으면 빈 문자열이다.
 */
@Converter
public class ProposalMoodIndexesConverter implements AttributeConverter<Set<Integer>, String> {

    @Override
    public String convertToDatabaseColumn(Set<Integer> moodIndexes) {
        if (moodIndexes == null || moodIndexes.isEmpty()) {
            return "";
        }
        return new TreeSet<>(moodIndexes).stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
    }

    @Override
    public Set<Integer> convertToEntityAttribute(String value) {
        if (value == null || value.isEmpty()) {
            return Collections.unmodifiableSet(new TreeSet<>());
        }
        TreeSet<Integer> moodIndexes = new TreeSet<>();
        Arrays.stream(value.split(",")).map(Integer::valueOf).forEach(moodIndexes::add);
        return Collections.unmodifiableSet(moodIndexes);
    }
}
