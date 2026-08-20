package com.project.jarihana.registration.query.repository.dto;

import java.util.List;

public record RegistrationListPage(
        List<RegistrationListProjection> items,
        boolean hasNext
) {

    public RegistrationListPage {
        items = List.copyOf(items);
    }
}
