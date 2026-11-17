package com.project.jarihana.rhythmbattle.domain;

/**
 * 승패 판정에 필요한 한 사람의 진행 상태다. outAt은 판이 끝난 곡 시각이며 살아 있으면 의미가 없다.
 */
public record BattleProgress(long memberId, BattleOutReason outReason, double outAt, double playedUntil) {
    public static BattleProgress alive(long memberId, double playedUntil) {
        return new BattleProgress(memberId, null, Double.NaN, playedUntil);
    }

    public static BattleProgress out(long memberId, BattleOutReason reason, double outAt, double playedUntil) {
        return new BattleProgress(memberId, reason, outAt, playedUntil);
    }

    public boolean out() {
        return outReason != null;
    }

    public boolean forfeited() {
        return out() && outReason.forfeit();
    }

    public boolean eliminated() {
        return outReason == BattleOutReason.ELIMINATED;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof BattleProgress that
                && memberId == that.memberId
                && outReason == that.outReason
                && Double.compare(outAt, that.outAt) == 0
                && Double.compare(playedUntil, that.playedUntil) == 0;
    }

    @Override
    public int hashCode() {
        return Long.hashCode(memberId) * 31 + Double.hashCode(playedUntil);
    }
}
