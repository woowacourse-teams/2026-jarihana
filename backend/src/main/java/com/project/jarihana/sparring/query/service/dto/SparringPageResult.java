package com.project.jarihana.sparring.query.service.dto;

import java.util.List;

public record SparringPageResult<T>(List<T> items, String nextCursor, boolean hasNext) {}
