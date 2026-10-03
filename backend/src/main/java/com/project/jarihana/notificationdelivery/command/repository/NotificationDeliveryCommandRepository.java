package com.project.jarihana.notificationdelivery.command.repository;

import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface NotificationDeliveryCommandRepository extends Repository<NotificationDelivery, Long> {

    NotificationDelivery save(NotificationDelivery delivery);

    Optional<NotificationDelivery> findById(long id);
}
