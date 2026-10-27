package com.project.jarihana.proposal.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.List;

/**
 * 제안자가 정한 분위기 선택지를 줄바꿈으로 이어 한 컬럼에 저장한다. 선택지에는 줄바꿈을 허용하지 않는다.
 */
@Converter
public class ProposalMoodOptionsConverter implements AttributeConverter<List<String>, String> {

    private static final String DELIMITER = "\n";

    @Override
    public String convertToDatabaseColumn(List<String> options) {
        if (options == null || options.isEmpty()) {
            return "";
        }
        return String.join(DELIMITER, options);
    }

    @Override
    public List<String> convertToEntityAttribute(String value) {
        if (value == null || value.isEmpty()) {
            return List.of();
        }
        return Arrays.stream(value.split(DELIMITER)).toList();
    }
}
