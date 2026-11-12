package com.project.jarihana.chairstack.domain;

public record ChairStackOwner(Long memberId, String guestDigest) {

    public boolean guest() {
        return memberId == null;
    }
}
