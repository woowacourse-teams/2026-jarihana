package com.project.jarihana.sparring.query.controller.dto;

import com.project.jarihana.sparring.query.service.dto.SparringListQuery;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SparringListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size,
        @Size(max = 80) String keyword,
        @Pattern(regexp = "all|active|mine") String filter) {
    public SparringListQuery toQuery() {
        return new SparringListQuery(
                cursor,
                size == null ? 20 : size,
                keyword == null ? "" : keyword.trim(),
                filter == null ? "all" : filter);
    }
}
