package com.project.jarihana.gomoku.domain;

public enum Stone {
    BLACK('1'),
    WHITE('2');
    private final char cell;

    Stone(char cell) {
        this.cell = cell;
    }

    public char cell() {
        return cell;
    }
}
