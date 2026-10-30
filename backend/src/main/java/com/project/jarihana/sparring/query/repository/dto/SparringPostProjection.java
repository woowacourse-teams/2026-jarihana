package com.project.jarihana.sparring.query.repository.dto;

import java.time.LocalDateTime;

public interface SparringPostProjection {
    Long getId();

    Long getAuthorId();

    String getName();

    String getMemberType();

    String getSide();

    String getText();

    LocalDateTime getCreatedAt();

    Long getReplyToId();

    Long getReplyAuthorId();

    String getReplyName();

    String getReplyMemberType();

    String getReplySide();

    String getReplyText();
}
