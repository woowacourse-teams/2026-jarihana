package com.project.jarihana.sparring.query.service.dto;

import com.project.jarihana.sparring.domain.SparringSide;

public record SparringPostsQuery(
        String cursor, int size, boolean mine, Long afterId, SparringSide side, Long throughId) {}
