package com.project.jarihana.registration.query.repository.dto;

import java.util.List;

public record MyRegistrationListPage(
        List<MyRegistrationListProjection> items,
        boolean hasNext
) {

    public MyRegistrationListPage {
        items = List.copyOf(items);
    }
}
