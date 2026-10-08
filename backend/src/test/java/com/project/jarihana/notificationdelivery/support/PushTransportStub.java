package com.project.jarihana.notificationdelivery.support;
import com.project.jarihana.notificationdelivery.client.PushTransport;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import org.springframework.boot.test.context.TestComponent;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
@TestComponent
public class PushTransportStub implements PushTransport {
    private final List<PushRequest> requests = new CopyOnWriteArrayList<>();
    private volatile Function<PushRequest, PushResult> response = request -> PushResult.accepted();
    public void reset() { requests.clear(); response = request -> PushResult.accepted(); }
    public void respond(Function<PushRequest, PushResult> response) { this.response = response; }
    public List<PushRequest> requests() { return List.copyOf(requests); }
    @Override
    public PushResult send(PushRequest request) {
        requests.add(request);
        return response.apply(request);
    }
}
