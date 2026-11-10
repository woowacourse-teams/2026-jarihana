package com.project.jarihana.groupmusic.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.group.domain.Group;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.time.Instant;
import java.time.Duration;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "group_music")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupMusic extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false, unique = true)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Group group;

    @Column(name = "music_json", nullable = false, columnDefinition = "text")
    private String musicJson;

    @Column(nullable = false)
    private long revision;

    @Enumerated(EnumType.STRING)
    @Column(name = "playback_state", nullable = false, length = 10)
    private PlaybackState playbackState;

    @Column(name = "playlist_index", nullable = false)
    private int playlistIndex;

    @Column(name = "position_seconds", nullable = false)
    private double positionSeconds;

    @Column(name = "anchor_time", nullable = false, columnDefinition = "timestamp with time zone")
    private Instant anchorTime;

    @Column(name = "playback_revision", nullable = false)
    private long playbackRevision;

    private GroupMusic(Long id, Group group, String musicJson, long revision, LocalDateTime createdAt,
                       PlaybackState playbackState, int playlistIndex, double positionSeconds, Instant anchorTime, long playbackRevision) {
        super(createdAt);
        this.id = id;
        this.group = Objects.requireNonNull(group);
        this.musicJson = Objects.requireNonNull(musicJson);
        this.revision = revision;
        this.playbackState = Objects.requireNonNull(playbackState);
        this.playlistIndex = playlistIndex;
        this.positionSeconds = positionSeconds;
        this.anchorTime = Objects.requireNonNull(anchorTime);
        this.playbackRevision = playbackRevision;
    }

    public static GroupMusic create(Group group, String musicJson, PlaybackState state, LocalDateTime now, Instant instant) {
        return new GroupMusic(null, group, musicJson, 1, now, state, 0, 0, instant, 1);
    }

    public GroupMusic replaceMusic(String musicJson, boolean resetPlayback, PlaybackState state, Instant now) {
        return new GroupMusic(id, group, musicJson, revision + 1, getCreatedAt(),
                resetPlayback ? state : playbackState, resetPlayback ? 0 : playlistIndex,
                resetPlayback ? 0 : positionSeconds, resetPlayback ? now : anchorTime,
                resetPlayback ? playbackRevision + 1 : playbackRevision);
    }

    public GroupMusic controlPlayback(long expectedRevision, PlaybackState state, int index, double position, Instant now) {
        if (state == null || index < 0 || !Double.isFinite(position) || position < 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "재생 위치와 상태를 확인해 주세요.");
        }
        requireRevision(expectedRevision);
        return withPlayback(state, index, position, now);
    }

    public GroupMusic advancePlayback(long expectedRevision, int index, double duration, int queueLength, Instant now) {
        if (!Double.isFinite(duration) || duration <= 0 || duration > 86400 || queueLength < 1 || queueLength > 5000 || index < 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "영상 길이와 재생목록을 확인해 주세요.");
        }
        requireRevision(expectedRevision);
        if (playbackState != PlaybackState.PLAYING || index != playlistIndex || index >= queueLength) throw conflict();
        double elapsedPosition = positionSeconds + Math.max(0, Duration.between(anchorTime, now).toMillis() / 1000.0);
        if (elapsedPosition < duration - 1) throw conflict();
        return withPlayback(PlaybackState.PLAYING, (index + 1) % queueLength, Math.max(0, elapsedPosition - duration), now);
    }

    public GroupMusic selectQueueSource(long expectedRevision, String musicJson, PlaybackState state,
                                        double position, Instant now) {
        requireRevision(expectedRevision);
        return new GroupMusic(id, group, musicJson, revision + 1, getCreatedAt(),
                state, 0, position, now, playbackRevision + 1);
    }

    private GroupMusic withPlayback(PlaybackState state, int index, double position, Instant now) {
        return new GroupMusic(id, group, musicJson, revision, getCreatedAt(), state, index, position, now, playbackRevision + 1);
    }

    private void requireRevision(long expectedRevision) { if (playbackRevision != expectedRevision) throw conflict(); }
    private BusinessException conflict() {
        return new BusinessException(ErrorCode.GROUP_MUSIC_CONFLICT, "재생 상태가 변경되었거나 아직 다음 곡으로 넘어갈 수 없습니다.");
    }

    public MusicPlayback getPlayback() {
        return MusicPlayback.of(playbackState, playlistIndex, positionSeconds, anchorTime, playbackRevision);
    }

    public Long getId() { return id; }
    public String getMusicJson() { return musicJson; }
    public long getRevision() { return revision; }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        return other instanceof GroupMusic music && id != null && id.equals(music.id);
    }

    @Override
    public int hashCode() { return Objects.hashCode(id); }
}
