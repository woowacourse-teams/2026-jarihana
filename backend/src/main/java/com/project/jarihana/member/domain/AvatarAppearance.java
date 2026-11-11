package com.project.jarihana.member.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.Map;

@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AvatarAppearance {
    @Column(nullable = false)
    private int version;
    @Column(name = "hair", nullable = false, length = 16)
    private String hair;
    @Column(name = "skin", nullable = false, length = 16)
    private String skin;
    @Column(name = "hair_color", nullable = false, length = 16)
    private String hairColor;
    @Column(name = "face", nullable = false, length = 16)
    private String face;
    @Column(name = "eyes", nullable = false, length = 16)
    private String eyes;
    @Column(name = "eyebrows", nullable = false, length = 16)
    private String eyebrows;
    @Column(name = "nose", nullable = false, length = 16)
    private String nose;
    @Column(name = "mouth", nullable = false, length = 16)
    private String mouth;
    @Column(name = "glasses", nullable = false, length = 16)
    private String glasses;
    @Column(name = "outfit", nullable = false, length = 16)
    private String outfit;
    @Column(name = "shoes", nullable = false, length = 16)
    private String shoes;
    @Column(name = "shoe_color", nullable = false, length = 16)
    private String shoeColor;
    @Column(name = "hat", nullable = false, length = 16)
    private String hat;
    @Column(name = "hat_color", nullable = false, length = 16)
    private String hatColor;
    @Column(name = "bag", nullable = false, length = 16)
    private String bag;
    @Column(name = "bag_color", nullable = false, length = 16)
    private String bagColor;
    @Column(name = "handheld", nullable = false, length = 16)
    private String handheld;

    private AvatarAppearance(int version, Map<AvatarCatalog, String> selections) {
        var validated = AvatarCatalog.validate(version, selections);
        this.version = version;
        this.hair = validated.get(AvatarCatalog.HAIR);
        this.skin = validated.get(AvatarCatalog.SKIN);
        this.hairColor = validated.get(AvatarCatalog.HAIR_COLOR);
        this.face = validated.get(AvatarCatalog.FACE);
        this.eyes = validated.get(AvatarCatalog.EYES);
        this.eyebrows = validated.get(AvatarCatalog.EYEBROWS);
        this.nose = validated.get(AvatarCatalog.NOSE);
        this.mouth = validated.get(AvatarCatalog.MOUTH);
        this.glasses = validated.get(AvatarCatalog.GLASSES);
        this.outfit = validated.get(AvatarCatalog.OUTFIT);
        this.shoes = validated.get(AvatarCatalog.SHOES);
        this.shoeColor = validated.get(AvatarCatalog.SHOE_COLOR);
        this.hat = validated.get(AvatarCatalog.HAT);
        this.hatColor = validated.get(AvatarCatalog.HAT_COLOR);
        this.bag = validated.get(AvatarCatalog.BAG);
        this.bagColor = validated.get(AvatarCatalog.BAG_COLOR);
        this.handheld = validated.get(AvatarCatalog.HANDHELD);
    }

    public static AvatarAppearance of(int version, Map<AvatarCatalog, String> selections) {
        return new AvatarAppearance(version, selections);
    }

    public static AvatarAppearance basic() {
        return of(1, AvatarCatalog.basicSelections());
    }
}
