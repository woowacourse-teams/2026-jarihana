package com.project.jarihana.group.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.time.DayOfWeek;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Converter
public class ActivityDaysConverter implements AttributeConverter<ActivityDays, String> {

    @Override
    public String convertToDatabaseColumn(ActivityDays activityDays) {
        if (activityDays == null) {
            return null;
        }
        return activityDays.values().stream()
                .map(DayOfWeek::name)
                .sorted()
                .collect(Collectors.joining(","));
    }

    @Override
    public ActivityDays convertToEntityAttribute(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        Set<DayOfWeek> daysOfWeek = Arrays.stream(value.split(","))
                .map(DayOfWeek::valueOf)
                .collect(Collectors.toSet());
        return ActivityDays.from(daysOfWeek);
    }
}
