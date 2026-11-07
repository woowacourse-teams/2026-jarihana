package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.domain.AvatarAppearance;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record CustomizeAvatarRequest(@NotNull @Valid AppearanceRequest appearance) {
    public record AppearanceRequest(int version, String hair, String skin, String hairColor, String face, String eyes, String eyebrows, String nose, String mouth, String glasses, String outfit, String shoes, String shoeColor, String hat, String hatColor, String bag, String bagColor, String handheld) {
        public AvatarAppearance toAppearance() {
            return AvatarAppearance.of(version, hair, skin, hairColor, face, eyes, eyebrows, nose, mouth, glasses, outfit,
                    shoes, shoeColor, hat, hatColor, bag, bagColor, handheld);
        }
    }
}
