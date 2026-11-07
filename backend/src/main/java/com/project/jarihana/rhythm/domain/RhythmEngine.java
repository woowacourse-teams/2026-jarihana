package com.project.jarihana.rhythm.domain;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 공식 도전의 판정을 서버에서 다시 계산한다.
 *
 * <p>프론트엔드 {@code engine.mjs}의 {@code GameEngine}과 같은 연산 순서로 루프를 붙이고 판정한다.
 * 같은 시드와 입력이면 같은 점수가 나와야 하므로 계산식을 바꿀 때는 두 엔진과
 * {@code golden-replays.json}을 함께 갱신한다. 프론트엔드 엔진은 모든 노트를 훑지만 여기서는 방향별 시간 순서 목록과
 * 진행 위치를 써서 같은 결과를 더 적은 비교로 얻는다.
 */
public final class RhythmEngine {
    static final double PERFECT_WINDOW = 0.032;
    static final double HIT_WINDOW = 0.064;
    static final double ENOUGH_WINDOW = 0.1;
    // 일찍 누른 입력은 ENOUGH를 120ms까지 준다. 늦게 누른 입력은 100ms를 넘기면 놓친다.
    static final double ENOUGH_EARLY_WINDOW = 0.12;
    static final double CAPTURE_WINDOW = 0.15;
    static final double POOR_WINDOW = 0.18;
    // 일찍 누른 입력은 200ms까지 판정(Uh oh 포함)을 받고, 그 뒤 30ms는 무시하며 230ms부터 헛공격이다.
    static final double EARLY_CAPTURE_WINDOW = 0.2;
    static final double EARLY_POOR_WINDOW = 0.23;
    static final double ATTACK_DURATION = 0.18;
    static final double APPROACH_SECONDS = 1.25;
    static final long POOR_PENALTY = 1000;
    private static final double EPSILON = 0.0000001;
    // 헛공격 판단은 EARLY_POOR_WINDOW 안의 노트만 보므로 이보다 넓게 훑으면 전체를 훑은 결과와 같다.
    private static final double SEARCH_WINDOW = 0.3;
    private static final double APPEND_AHEAD_SECONDS = 4;
    private static final List<RhythmLane> LANES = List.of(RhythmLane.values());

    private final RhythmChart chart;
    private final RhythmChart.Level levelChart;
    private final double scrollSpeed;
    private final RhythmRandom random;
    private final List<Loop> loops = new ArrayList<>();
    private final List<Note> notes = new ArrayList<>();
    private final List<Group> groups = new ArrayList<>();
    private final Map<RhythmLane, List<Note>> laneNotes = new EnumMap<>(RhythmLane.class);
    private int notePointer;
    private int groupPointer;
    private int nextLoopToHeal;
    private int lives;
    private long score;
    private int combo;
    private int bestCombo;
    private int perfect;
    private int hit;
    private int enough;
    private int uhoh;
    private int poor;
    private int miss;
    private boolean dead;
    private double elapsed;

    private RhythmEngine(RhythmChart chart, RhythmLevel level, double scrollSpeed, int seed, int startLoop) {
        if (!Double.isFinite(scrollSpeed) || scrollSpeed < 1 || scrollSpeed > 3 || scrollSpeed * 4 != Math.rint(scrollSpeed * 4)) {
            throw new IllegalArgumentException("세균 이동 배속은 1.0부터 3.0까지 0.25 단위로 설정할 수 있습니다.");
        }
        if (startLoop < 1) {
            throw new IllegalArgumentException("시작 루프는 1 이상이어야 합니다.");
        }
        this.chart = chart;
        this.levelChart = chart.level(level);
        this.scrollSpeed = scrollSpeed;
        this.random = new RhythmRandom(seed);
        this.lives = levelChart.lives();
        for (RhythmLane lane : LANES) {
            laneNotes.put(lane, new ArrayList<>());
        }
        double rate = rateForLoop(startLoop);
        double countInDuration = ((60 / chart.bpm()) * 4) / rate;
        double leadIn = Math.max(countInDuration, APPROACH_SECONDS / this.scrollSpeed / rate);
        appendLoop(startLoop, leadIn, LANES);
        appendNextLoop();
    }

    public static RhythmEngine start(RhythmChart chart, RhythmLevel level, double scrollSpeed, int seed) {
        return new RhythmEngine(chart, level, scrollSpeed, seed, 1);
    }

    /**
     * 빨라진 루프의 판정을 대조하는 테스트에서만 쓴다. 공식 도전은 항상 1루프부터 시작한다.
     */
    static RhythmEngine startAtLoop(RhythmChart chart, RhythmLevel level, double scrollSpeed, int seed, int startLoop) {
        return new RhythmEngine(chart, level, scrollSpeed, seed, startLoop);
    }

    static double rateForLoop(int loopNumber) {
        return Math.round((1 + Math.max(0, loopNumber - 5) * 0.05) * 100) / 100.0;
    }

    /**
     * 클라이언트가 보낸 입력 묶음을 받은 순서대로 판정하고, 묶음을 보낸 시각까지 진행한다.
     */
    public void play(List<RhythmInput> inputs, double playedUntil) {
        for (RhythmInput input : inputs) {
            tick(input.at());
            input(input.lane(), input.at());
        }
        tick(playedUntil);
    }

    /**
     * 클라이언트에서 판이 끝났다고 알렸는데 서버 계산이 아직 살아 있으면, 그 뒤로 입력이 없는 것으로 보고 끝까지 진행한다.
     */
    public void playUntilDead(double from, double limit) {
        for (double time = from; !dead && time <= limit; time += 0.1) {
            tick(time);
        }
    }

    private void appendLoop(int number, double start, List<RhythmLane> map) {
        double rate = rateForLoop(number);
        double duration = chart.durationSeconds() / rate;
        List<RhythmChart.Staircase> staircases = levelChart.staircasesFor(map);
        loops.add(new Loop(number, start, start + duration, List.copyOf(map)));
        for (RhythmChart.Event event : levelChart.events()) {
            double songTime = event.sample() / chart.sampleRateHz();
            double at = start + songTime / rate;
            RhythmChart.Staircase staircase = staircaseAt(staircases, event.step());
            Group group = new Group(at);
            groups.add(group);
            for (RhythmLane original : event.keys()) {
                RhythmLane lane = staircase == null
                        ? map.get(original.ordinal())
                        : original.rotate(staircase.shift());
                Note note = new Note(lane, at, group);
                group.notes.add(note);
                notes.add(note);
                laneNotes.get(lane).add(note);
            }
        }
    }

    private static RhythmChart.Staircase staircaseAt(List<RhythmChart.Staircase> staircases, int step) {
        for (RhythmChart.Staircase staircase : staircases) {
            if (step >= staircase.start() && step < staircase.end()) {
                return staircase;
            }
        }
        return null;
    }

    private void appendNextLoop() {
        Loop last = loops.getLast();
        appendLoop(last.number + 1, last.end, shuffleLanes(last.map));
    }

    private List<RhythmLane> shuffleLanes(List<RhythmLane> previous) {
        List<RhythmLane> map;
        do {
            map = new ArrayList<>(LANES);
            for (int index = map.size() - 1; index > 0; index--) {
                int target = (int) Math.floor(random.next() * (index + 1));
                RhythmLane swap = map.get(index);
                map.set(index, map.get(target));
                map.set(target, swap);
            }
        } while (map.equals(previous));
        return map;
    }

    private void input(RhythmLane lane, double at) {
        if (dead) {
            return;
        }
        List<Note> candidates = laneNotes.get(lane);
        Note closest = null;
        double distance = Double.POSITIVE_INFINITY;
        boolean nearby = false;
        for (int index = firstAtOrAfter(candidates, at - SEARCH_WINDOW); index < candidates.size(); index++) {
            Note note = candidates.get(index);
            if (note.at > at + SEARCH_WINDOW) {
                break;
            }
            double error = Math.abs(at - note.at);
            if ((note.state != NoteState.WAITING && note.state != NoteState.ATTACK) || note.group.damaged) {
                continue;
            }
            // 노트보다 일찍 누른 입력은 더 넓은 범위로 판정하고 무시한다.
            boolean early = at < note.at;
            if (error + EPSILON < (early ? EARLY_POOR_WINDOW : POOR_WINDOW)) {
                nearby = true;
            }
            if (note.whiffed) {
                continue;
            }
            if (error <= (early ? EARLY_CAPTURE_WINDOW : CAPTURE_WINDOW) + EPSILON && error < distance) {
                closest = note;
                distance = error;
            }
        }
        if (closest != null) {
            hit(closest, at);
            return;
        }
        if (nearby) {
            return;
        }
        score -= POOR_PENALTY;
        poor++;
        combo = 0;
    }

    private static int firstAtOrAfter(List<Note> candidates, double time) {
        int low = 0;
        int high = candidates.size();
        while (low < high) {
            int middle = (low + high) >>> 1;
            if (candidates.get(middle).at < time) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low;
    }

    private void hit(Note note, double at) {
        double signed = at - note.at;
        double delta = Math.abs(signed);
        double enoughWindow = signed < 0 ? ENOUGH_EARLY_WINDOW : ENOUGH_WINDOW;
        if (delta <= PERFECT_WINDOW + EPSILON) {
            catchNote(note, 1000);
            perfect++;
        } else if (delta <= HIT_WINDOW + EPSILON) {
            catchNote(note, 600);
            hit++;
        } else if (delta <= enoughWindow + EPSILON) {
            catchNote(note, 300);
            enough++;
        } else {
            // 100ms를 넘긴 입력은 세균을 놓친다. 노트는 그대로 다가와 돌진하고 콤보만 바로 끊긴다.
            note.whiffed = true;
            uhoh++;
            combo = 0;
        }
    }

    private void catchNote(Note note, long points) {
        note.state = NoteState.CAUGHT;
        score += points;
        combo++;
        bestCombo = Math.max(bestCombo, combo);
    }

    private void tick(double time) {
        if (dead) {
            return;
        }
        elapsed = time;
        while (loops.getLast().end - time < APPEND_AHEAD_SECONDS) {
            appendNextLoop();
        }
        while (notePointer < notes.size() && time > notes.get(notePointer).at + CAPTURE_WINDOW) {
            Note note = notes.get(notePointer++);
            if (note.state == NoteState.WAITING) {
                note.state = NoteState.ATTACK;
            }
        }
        while (groupPointer < groups.size()
                && !(time < groups.get(groupPointer).at + CAPTURE_WINDOW + ATTACK_DURATION)) {
            Group group = groups.get(groupPointer++);
            healCompletedLoops(group.at + CAPTURE_WINDOW + ATTACK_DURATION);
            damage(group);
            if (dead) {
                return;
            }
        }
        healCompletedLoops(time);
    }

    private void healCompletedLoops(double time) {
        while (nextLoopToHeal < loops.size() && loops.get(nextLoopToHeal).end <= time) {
            lives = Math.min(levelChart.lives(), lives + levelChart.loopHeal());
            nextLoopToHeal++;
        }
    }

    private void damage(Group group) {
        if (group.damaged) {
            return;
        }
        int missed = 0;
        int counted = 0;
        for (Note note : group.notes) {
            if (note.state != NoteState.ATTACK) {
                continue;
            }
            missed++;
            if (!note.whiffed) {
                counted++;
            }
        }
        if (missed == 0) {
            return;
        }
        group.damaged = true;
        for (Note note : group.notes) {
            if (note.state == NoteState.ATTACK) {
                note.state = NoteState.GONE;
            }
        }
        miss += counted;
        lives--;
        combo = 0;
        if (lives <= 0) {
            dead = true;
        }
    }

    public RhythmScore score() {
        return new RhythmScore(score, perfect, hit, enough, uhoh, poor, miss, bestCombo, currentLoopNumber());
    }

    private int currentLoopNumber() {
        for (Loop loop : loops) {
            if (elapsed < loop.end) {
                return loop.number;
            }
        }
        return loops.getLast().number;
    }

    public int lives() {
        return lives;
    }

    public int combo() {
        return combo;
    }

    public boolean dead() {
        return dead;
    }

    List<List<RhythmLane>> loopMaps() {
        return loops.stream().map(loop -> loop.map).toList();
    }

    private enum NoteState {
        WAITING,
        ATTACK,
        CAUGHT,
        GONE
    }

    private record Loop(int number, double start, double end, List<RhythmLane> map) {
    }

    private static final class Group {
        private final double at;
        private final List<Note> notes = new ArrayList<>();
        private boolean damaged;

        private Group(double at) {
            this.at = at;
        }
    }

    private static final class Note {
        private final RhythmLane lane;
        private final double at;
        private final Group group;
        private NoteState state = NoteState.WAITING;
        private boolean whiffed;

        private Note(RhythmLane lane, double at, Group group) {
            this.lane = lane;
            this.at = at;
            this.group = group;
        }
    }
}
