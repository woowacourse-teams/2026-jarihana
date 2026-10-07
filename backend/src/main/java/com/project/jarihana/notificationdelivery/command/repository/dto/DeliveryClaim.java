package com.project.jarihana.notificationdelivery.command.repository.dto;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import java.util.UUID;
public record DeliveryClaim(long id, UUID token, DeliveryStatus status) { }
