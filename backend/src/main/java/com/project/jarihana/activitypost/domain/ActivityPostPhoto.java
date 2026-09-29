package com.project.jarihana.activitypost.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "activity_post_photo",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_activity_post_photo_post_id", columnNames = "activity_post_id"),
                @UniqueConstraint(name = "uk_activity_post_photo_image_key", columnNames = "image_key")
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityPostPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_post_id", nullable = false)
    private ActivityPost post;

    @Column(name = "image_key", nullable = false, length = 255)
    private String imageKey;

    private ActivityPostPhoto(ActivityPost post, String imageKey) {
        this.post = require(post);
        this.imageKey = validateImageKey(imageKey);
    }

    public static ActivityPostPhoto create(ActivityPost post, String imageKey) {
        return new ActivityPostPhoto(post, imageKey);
    }

    public void replaceImageKey(String imageKey) {
        this.imageKey = validateImageKey(imageKey);
    }

    private static String validateImageKey(String imageKey) {
        if (imageKey == null || imageKey.isBlank() || imageKey.length() > 255) {
            throw new IllegalArgumentException("이미지 키는 필수이며 255자 이하여야 합니다.");
        }
        return imageKey;
    }

    private static ActivityPost require(ActivityPost post) {
        if (post == null) {
            throw new IllegalArgumentException("게시글은 필수입니다.");
        }
        return post;
    }

    public Long getId() {
        return id;
    }

    public ActivityPost getPost() {
        return post;
    }

    public String getImageKey() {
        return imageKey;
    }
}
