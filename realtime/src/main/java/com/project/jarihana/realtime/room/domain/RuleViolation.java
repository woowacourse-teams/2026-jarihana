package com.project.jarihana.realtime.room.domain;

public final class RuleViolation extends RuntimeException {
    private final String code;
    private final String reason;

    public RuleViolation(String code) {
        this(code, code);
    }

    public RuleViolation(String code, String reason) {
        super(code);
        this.code = code;
        this.reason = reason;
    }

    public String code() { return code; }
    public String reason() { return reason; }
}
