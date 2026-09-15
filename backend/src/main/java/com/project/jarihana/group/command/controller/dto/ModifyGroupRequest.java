package com.project.jarihana.group.command.controller.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.project.jarihana.group.command.service.dto.ModifyGroupCommand;
import com.project.jarihana.group.domain.MeetingType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

public final class ModifyGroupRequest {

    @NotBlank
    @Size(max = 50)
    private final String name;

    @NotBlank
    @Size(max = 100)
    private final String introduction;

    @Size(max = 10_000)
    private final String description;

    @NotNull
    private final MeetingType meetingType;

    @Size(max = 255)
    private final String location;

    @Size(max = 255)
    private final String representativeImageKey;

    private final boolean representativeImageKeyPresent;
    private final boolean representativeImageKeyValueValid;
    private final boolean descriptionPresent;
    private final boolean descriptionValueValid;
    private final boolean locationPresent;
    private final boolean locationValueValid;

    @JsonCreator
    public ModifyGroupRequest(
            @JsonProperty("name") String name,
            @JsonProperty("introduction") String introduction,
            @JsonProperty("description") JsonNode description,
            @JsonProperty("meetingType") MeetingType meetingType,
            @JsonProperty("location") JsonNode location,
            @JsonProperty("representativeImageKey") JsonNode representativeImageKey
    ) {
        this.name = name;
        this.introduction = introduction;
        this.description = nullableTextValue(description);
        this.meetingType = meetingType;
        this.location = nullableTextValue(location);
        this.representativeImageKey = imageKeyValue(representativeImageKey);
        this.representativeImageKeyPresent = representativeImageKey != null;
        this.representativeImageKeyValueValid = representativeImageKey == null
                || representativeImageKey.isNull()
                || representativeImageKey.isString();
        this.descriptionPresent = description != null;
        this.descriptionValueValid = isNullableText(description);
        this.locationPresent = location != null;
        this.locationValueValid = isNullableText(location);
    }

    private static String nullableTextValue(JsonNode value) {
        if (value == null || value.isNull() || !value.isString()) {
            return null;
        }
        return value.stringValue();
    }

    private static boolean isNullableText(JsonNode value) {
        return value == null || value.isNull() || value.isString();
    }

    private static String imageKeyValue(JsonNode representativeImageKey) {
        return nullableTextValue(representativeImageKey);
    }

    @AssertTrue(message = "대표 이미지 키 필드는 필수입니다.")
    public boolean isRepresentativeImageKeyPresent() {
        return representativeImageKeyPresent;
    }

    @AssertTrue(message = "대표 이미지 키는 문자열 또는 null이어야 합니다.")
    public boolean isRepresentativeImageKeyValueValid() {
        return representativeImageKeyValueValid;
    }

    @AssertTrue(message = "상세 소개 필드는 필수입니다.")
    public boolean isDescriptionPresent() {
        return descriptionPresent;
    }

    @AssertTrue(message = "상세 소개는 문자열 또는 null이어야 합니다.")
    public boolean isDescriptionValueValid() {
        return descriptionValueValid;
    }

    @AssertTrue(message = "장소 필드는 필수입니다.")
    public boolean isLocationPresent() {
        return locationPresent;
    }

    @AssertTrue(message = "장소는 문자열 또는 null이어야 합니다.")
    public boolean isLocationValueValid() {
        return locationValueValid;
    }

    public ModifyGroupCommand toCommand() {
        return new ModifyGroupCommand(name, introduction, description, meetingType, location,
                representativeImageKey);
    }
}
