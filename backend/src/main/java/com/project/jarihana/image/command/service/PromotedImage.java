package com.project.jarihana.image.command.service;

import java.util.UUID;

public record PromotedImage(UUID uploadId, String previousKey, String imageKey) {
}
