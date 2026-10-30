package com.project.jarihana.sparring.command.controller.dto;

import com.project.jarihana.sparring.domain.SparringSide;

import jakarta.validation.constraints.NotNull;

public record SparringVoteRequest(@NotNull SparringSide side) {}
