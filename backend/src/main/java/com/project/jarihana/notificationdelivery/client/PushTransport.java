package com.project.jarihana.notificationdelivery.client;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import java.util.concurrent.CompletableFuture;
public interface PushTransport {
    CompletableFuture<PushResult> send(PushRequest request);
}
