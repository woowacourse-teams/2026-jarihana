package com.project.jarihana.groupspace.command.service.dto;

import tools.jackson.databind.JsonNode;

public record SaveGroupSpaceCommand(JsonNode room, long expectedRevision) {}
