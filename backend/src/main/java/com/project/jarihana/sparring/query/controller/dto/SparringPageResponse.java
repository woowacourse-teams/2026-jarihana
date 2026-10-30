package com.project.jarihana.sparring.query.controller.dto;

import java.util.List;

public record SparringPageResponse<T>(List<T> items, String nextCursor, boolean hasNext) {}
