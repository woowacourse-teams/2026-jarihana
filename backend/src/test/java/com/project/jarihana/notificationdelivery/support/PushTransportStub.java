package com.project.jarihana.notificationdelivery.support;
import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import org.springframework.boot.test.context.TestComponent;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
@TestComponent
public class PushTransportStub implements PushTransport {
    private final List<PushRequest> requests = new CopyOnWriteArrayList<>();
    private volatile Function<PushRequest, CompletableFuture<PushResult>> response = request -> CompletableFuture.completedFuture(PushResult.accepted());
    public void reset() { requests.clear(); response = request -> CompletableFuture.completedFuture(PushResult.accepted()); }
    public void respond(Function<PushRequest, PushResult> response) {
        this.response = request -> CompletableFuture.completedFuture(response.apply(request));
    }
    public void respondAsync(Function<PushRequest, CompletableFuture<PushResult>> response) { this.response = response; }
    public List<PushRequest> requests() { return List.copyOf(requests); }
    @Override
    public CompletableFuture<PushResult> send(PushRequest request) {
        requests.add(request);
        return response.apply(request);
    }
}
