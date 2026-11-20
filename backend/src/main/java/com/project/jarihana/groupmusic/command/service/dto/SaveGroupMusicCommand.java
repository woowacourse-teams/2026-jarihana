package com.project.jarihana.groupmusic.command.service.dto;

import tools.jackson.databind.JsonNode;

public record SaveGroupMusicCommand(JsonNode music, long expectedRevision) {}
