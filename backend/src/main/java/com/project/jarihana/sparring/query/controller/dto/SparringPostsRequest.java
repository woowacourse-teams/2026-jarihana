package com.project.jarihana.sparring.query.controller.dto;

import com.project.jarihana.sparring.domain.SparringSide;
import com.project.jarihana.sparring.query.service.dto.SparringPostsQuery;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;

public record SparringPostsRequest(
        String cursor,
        @Min(1) @Max(100) Integer size,
        Boolean mine,
        @PositiveOrZero Long afterId,
        SparringSide side,
        @PositiveOrZero Long throughId) {
    public SparringPostsQuery toQuery() {
        return new SparringPostsQuery(
                cursor, size == null ? 20 : size, Boolean.TRUE.equals(mine), afterId, side, throughId);
    }
}
