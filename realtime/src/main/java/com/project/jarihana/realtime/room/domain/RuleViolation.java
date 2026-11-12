package com.project.jarihana.realtime.room.domain;

public final class RuleViolation extends RuntimeException {
    private final String code;

    public RuleViolation(String code) {
        super(code);
        this.code = code;
    }

    public String code() { return code; }
}
