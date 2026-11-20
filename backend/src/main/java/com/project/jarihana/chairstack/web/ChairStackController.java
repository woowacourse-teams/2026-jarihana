package com.project.jarihana.chairstack.web;

import com.project.jarihana.chairstack.command.ChairStackCommandService;
import com.project.jarihana.chairstack.command.ChairStackPlayerRepository;
import com.project.jarihana.chairstack.command.ChairStackPlayerRepository.Player;
import com.project.jarihana.chairstack.domain.ChairStackRules;
import com.project.jarihana.chairstack.domain.ChairStackPhysics;
import com.project.jarihana.chairstack.domain.ChairStackRun;
import com.project.jarihana.chairstack.domain.ChairStackToyRules;
import com.project.jarihana.chairstack.query.ChairStackRankingQuery;
import com.project.jarihana.common.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(ChairStackIdentity.PATH)
@RequiredArgsConstructor
public class ChairStackController {

    private final ChairStackIdentity identity;
    private final ChairStackPlayerRepository players;
    private final ChairStackCommandService commands;
    private final ChairStackRankingQuery rankings;
    private final Clock clock;

    @GetMapping("/runs/current")
    public ResponseEntity<ApiResponse<State>> current(
            @CookieValue(value = ChairStackIdentity.COOKIE, required = false) String token,
            @RequestParam(defaultValue = "false") boolean member,
            HttpServletRequest request, HttpServletResponse servletResponse) {
        var owner = member ? identity.resolveForMutation(token, true) : identity.resolve(token);
        if (owner.guest() && owner.guestDigest() == null) {
            servletResponse.addHeader(HttpHeaders.SET_COOKIE, identity.newGuestCookie(request.getContextPath()).toString());
        }
        return response(state(players.find(owner).orElse(null), owner.guest()));
    }

    @PostMapping("/runs")
    public ResponseEntity<ApiResponse<State>> start(
            @CookieValue(value = ChairStackIdentity.COOKIE, required = false) String token,
            @Valid @RequestBody StartRequest request) {
        var owner = identity.resolveForMutation(token, request.member());
        var player = commands.start(owner, request.nickname(), request.previousRunId(), request.requestId());
        return response(state(player, owner.guest()));
    }

    @PostMapping("/drops")
    public ResponseEntity<ApiResponse<State>> drop(
            @CookieValue(value = ChairStackIdentity.COOKIE, required = false) String token,
            @Valid @RequestBody DropRequest request) {
        var owner = identity.resolveForMutation(token, request.member());
        var adjustment = request.adjustment() == null ? null : request.adjustment().toDomain();
        var move = commands.drop(owner, request.runId(), request.turn(), request.x(),
                request.phaseMs() == null ? 0 : request.phaseMs(), request.orientation(), adjustment, request.requestId());
        var snapshot = state(move.player(), owner.guest());
        return response(new State(snapshot.guest(), snapshot.nickname(), snapshot.bestScore(),
                snapshot.run(), move.frames()));
    }

    @GetMapping("/rankings")
    public ResponseEntity<ApiResponse<ChairStackRankingQuery.Ranking>> rankings(
            @CookieValue(value = ChairStackIdentity.COOKIE, required = false) String token,
            @RequestParam(required = false) @Size(max = 128) String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return response(rankings.find(identity.resolve(token), cursor, size));
    }

    private <T> ResponseEntity<ApiResponse<T>> response(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(value));
    }

    private State state(Player player, boolean guest) {
        if (player == null) {
            return new State(guest, null, 0, null, List.of());
        }
        var run = player.run();
        if (run.expired(OffsetDateTime.now(clock))) {
            return new State(guest, player.nickname(), player.bestScore(), null, List.of());
        }
        int height = run.positions().size();
        List<Placement> placements = IntStream.range(0, height)
                .mapToObj(index -> new Placement(Shape.of(index), run.positions().get(index),
                        run.toyMode() ? run.toyPoses().get(index).y() : null,
                        run.toyMode() ? run.toyPoses().get(index).orientation() : 0)).toList();
        Shape active = run.finished() ? null : Shape.of(height);
        Shape preview = run.finished() || height + 1 >= ChairStackRules.MAX_CHAIRS ? null : Shape.of(height + 1);
        return new State(guest, player.nickname(), player.bestScore(),
                new Run(run.id(), placements, active, preview, run.failedLayer(), run.finished(), run.toyMode(),
                        ChairStackRules.motion(height, run.stress()), physics(run)), List.of());
    }

    private PhysicsScene physics(ChairStackRun run) {
        if (!run.physicsMode()) return null;
        List<PhysicsChair> chairs = IntStream.range(0, run.physicsPoses().size())
                .mapToObj(index -> {
                    var pose = run.physicsPoses().get(index);
                    var piece = ChairStackPhysics.piece(run.id(), index, run.physicsProfile()).withMirror(pose.mirror());
                    return new PhysicsChair(piece, pose);
                }).toList();
        int count = run.positions().size();
        return new PhysicsScene(chairs, run.finished() ? null : ChairStackPhysics.piece(run.id(), count, run.physicsProfile()),
                run.finished() || count + 1 >= ChairStackRules.MAX_CHAIRS
                        ? null : ChairStackPhysics.piece(run.id(), count + 1, run.physicsProfile()),
                run.finished() ? 0 : ChairStackPhysics.launchY(run.id(), run.physicsPoses(), run.physicsProfile()),
                ChairStackPhysics.PLATFORM_HALF_WIDTH);
    }

    public record StartRequest(@NotNull Boolean member, @Size(max = 48) String nickname,
                               UUID previousRunId, @NotNull UUID requestId) {
    }

    public record DropRequest(@NotNull Boolean member, @NotNull UUID runId, @NotNull @Min(0) @Max(99) Integer turn,
                              @NotNull @Min(-ChairStackRules.AIM_LIMIT) @Max(ChairStackRules.AIM_LIMIT) Integer x,
                              @Min(0) @Max(2799) Integer phaseMs,
                              @Min(0) @Max(ChairStackToyRules.ORIENTATIONS - 1) Integer orientation,
                              @Valid PlacementAdjustment adjustment, @NotNull UUID requestId) {
    }

    public record PlacementAdjustment(@NotNull @Min(-180) @Max(180) Integer angleDegrees,
                                      @NotNull Boolean mirrored) {
        ChairStackPhysics.Adjustment toDomain() {
            return new ChairStackPhysics.Adjustment(angleDegrees, mirrored);
        }
    }

    public record State(boolean guest, String nickname, int bestScore, Run run, List<ChairStackPhysics.Frame> frames) {
    }

    public record Run(UUID id, List<Placement> placements, Shape active, Shape preview, Integer failedLayer,
                      boolean finished, boolean toyMode, ChairStackRules.Motion motion, PhysicsScene physics) {
    }

    public record PhysicsScene(List<PhysicsChair> chairs, ChairStackPhysics.Piece active,
                               ChairStackPhysics.Piece preview, double launchY, double platformHalfWidth) {
    }

    public record PhysicsChair(ChairStackPhysics.Piece piece, ChairStackPhysics.Pose pose) {
    }

    public record Placement(Shape chair, int x, Integer y, int orientation) {
    }

    public record Shape(int width, int left, int right, ChairStackToyRules.Toy toy, int orientation) {
        static Shape of(int index) {
            var shape = ChairStackRules.chair(index);
            return new Shape(shape.width(), shape.supportLeft(), shape.supportRight(), ChairStackToyRules.toy(index),
                    ChairStackToyRules.initialOrientation(index));
        }
    }
}
