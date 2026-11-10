package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.member.domain.AvatarCatalog;
import java.util.EnumMap;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record CustomizeAvatarRequest(@NotNull @Valid AppearanceRequest appearance) {
    public record AppearanceRequest(int version, String hair, String skin, String hairColor, String face, String eyes, String eyebrows, String nose, String mouth, String glasses, String outfit, String shoes, String shoeColor, String hat, String hatColor, String bag, String bagColor, String handheld) {
        public AvatarAppearance toAppearance() {
            var selections = new EnumMap<AvatarCatalog, String>(AvatarCatalog.class);
            selections.put(AvatarCatalog.HAIR, hair);
            selections.put(AvatarCatalog.SKIN, skin);
            selections.put(AvatarCatalog.HAIR_COLOR, hairColor);
            selections.put(AvatarCatalog.FACE, face);
            selections.put(AvatarCatalog.EYES, eyes);
            selections.put(AvatarCatalog.EYEBROWS, eyebrows);
            selections.put(AvatarCatalog.NOSE, nose);
            selections.put(AvatarCatalog.MOUTH, mouth);
            selections.put(AvatarCatalog.GLASSES, glasses);
            selections.put(AvatarCatalog.OUTFIT, outfit);
            selections.put(AvatarCatalog.SHOES, shoes);
            selections.put(AvatarCatalog.SHOE_COLOR, shoeColor);
            selections.put(AvatarCatalog.HAT, hat);
            selections.put(AvatarCatalog.HAT_COLOR, hatColor);
            selections.put(AvatarCatalog.BAG, bag);
            selections.put(AvatarCatalog.BAG_COLOR, bagColor);
            selections.put(AvatarCatalog.HANDHELD, handheld);
            return AvatarAppearance.of(version, selections);
        }
    }
}
