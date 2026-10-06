package com.project.jarihana.notificationdelivery.client;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
public interface PushTransport {
    PushResult send(PushRequest request);
}
