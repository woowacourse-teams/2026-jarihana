package com.project.jarihana.group.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.time.DayOfWeek;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

public class ActivityDays {

    private final Set<DayOfWeek> values;

    private ActivityDays(Set<DayOfWeek> values) {
        this.values = values;
    }

    public static ActivityDays from(Set<DayOfWeek> daysOfWeek) {
        return new ActivityDays(validate(daysOfWeek));
    }

    private static Set<DayOfWeek> validate(Set<DayOfWeek> daysOfWeek) {
        if (daysOfWeek == null || daysOfWeek.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "활동 요일은 하나 이상이어야 합니다.");
        }
        if (daysOfWeek.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "활동 요일에는 null이 포함될 수 없습니다.");
        }
        return Collections.unmodifiableSet(EnumSet.copyOf(daysOfWeek));
    }

    public boolean contains(DayOfWeek dayOfWeek) {
        return values.contains(dayOfWeek);
    }

    public int size() {
        return values.size();
    }

    public Set<DayOfWeek> values() {
        return values;
    }
}
