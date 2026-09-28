package com.project.jarihana.feedback.command.repository;

import com.project.jarihana.feedback.domain.Feedback;
import org.springframework.data.repository.Repository;

public interface FeedbackCommandRepository extends Repository<Feedback, Long> {

    Feedback save(Feedback feedback);
}
