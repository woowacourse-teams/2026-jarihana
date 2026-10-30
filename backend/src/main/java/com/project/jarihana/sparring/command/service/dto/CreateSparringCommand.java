package com.project.jarihana.sparring.command.service.dto;

import java.time.LocalDateTime;

public record CreateSparringCommand(
        String title, String a, String b, String description, LocalDateTime closesAt, String representativeImageKey) {}
