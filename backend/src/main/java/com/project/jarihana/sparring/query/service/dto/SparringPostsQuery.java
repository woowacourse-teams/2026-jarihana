package com.project.jarihana.sparring.query.service.dto;

public record SparringPostsQuery(String cursor, int size, boolean mine, Long afterId) {}
