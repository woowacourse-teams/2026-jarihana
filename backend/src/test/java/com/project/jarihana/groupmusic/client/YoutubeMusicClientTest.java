package com.project.jarihana.groupmusic.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.io.IOException;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class YoutubeMusicClientTest {
    private static final String VIDEO_ID = "dQw4w9WgXcQ";
    private MockRestServiceServer server;
    private YoutubeMusicClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com/youtube/v3");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new YoutubeMusicClient("test-key", builder.build());
    }

    @Test
    void readsDurationAndSendsKeyOnlyInHeader() {
        server.expect(requestTo("https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=" + VIDEO_ID))
                .andExpect(header("X-Goog-Api-Key", "test-key"))
                .andRespond(withSuccess(video("PT3M25S", "true"), MediaType.APPLICATION_JSON));

        assertThat(client.findPlayableDuration(VIDEO_ID)).contains(Duration.ofSeconds(205));
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"items\":[]}",
            "{\"items\":[{\"id\":\"dQw4w9WgXcQ\",\"status\":{\"embeddable\":false}}]}",
            "{\"items\":[{\"id\":\"dQw4w9WgXcQ\",\"status\":{\"embeddable\":true,\"privacyStatus\":\"private\"}}]}"
    })
    void confirmsUnavailableOnlyFromSuccessfulResponse(String response) {
        server.expect(queryParam("id", VIDEO_ID)).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

        assertThat(client.findPlayableDuration(VIDEO_ID)).isEmpty();
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"items\":null}", "{\"items\":[{}]}",
            "{\"items\":[{\"id\":\"differentId\",\"status\":{\"embeddable\":true}}]}"})
    void malformedResponsesCannotMarkAVideoUnavailable(String response) {
        server.expect(queryParam("id", VIDEO_ID)).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.findPlayableDuration(VIDEO_ID)).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_MUSIC_VERIFICATION_UNAVAILABLE);
        server.verify();
    }

    @Test
    void quotaErrorAndNetworkFailureRemainRetryable() {
        server.expect(queryParam("id", VIDEO_ID)).andRespond(withStatus(HttpStatus.FORBIDDEN));
        server.expect(queryParam("id", VIDEO_ID)).andRespond(withException(new IOException("timeout")));

        for (int i = 0; i < 2; i++) {
            assertThatThrownBy(() -> client.findPlayableDuration(VIDEO_ID)).isInstanceOf(BusinessException.class)
                    .extracting(exception -> ((BusinessException) exception).getErrorCode())
                    .isEqualTo(ErrorCode.GROUP_MUSIC_VERIFICATION_UNAVAILABLE);
        }
        server.verify();
    }

    @Test
    void missingKeyFailsBeforeSendingAnyRequest() {
        YoutubeMusicClient missingKey = new YoutubeMusicClient("", RestClient.create());

        assertThatThrownBy(() -> missingKey.findPlayableDuration(VIDEO_ID)).isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.GROUP_MUSIC_VERIFICATION_UNAVAILABLE);
    }

    @Test
    void resolvesExistingPlaylistPositionAcrossPages() {
        server.expect(queryParam("playlistId", "PLabcdefghijk"))
                .andExpect(queryParam("maxResults", "50"))
                .andRespond(withSuccess("""
                        {"items":[{"contentDetails":{"videoId":"abcdefghijk"}}],"nextPageToken":"second"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(queryParam("pageToken", "second"))
                .andRespond(withSuccess("""
                        {"items":[{"contentDetails":{"videoId":"dQw4w9WgXcQ"}}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.getPlaylistTrack("PLabcdefghijk", 1))
                .isEqualTo(new YoutubeMusicClient.PlaylistTrack(VIDEO_ID, false));
        server.verify();
    }

    private String video(String duration, String embeddable) {
        return """
                {"items":[{"id":"dQw4w9WgXcQ","status":{"embeddable":%s,"privacyStatus":"public"},
                "contentDetails":{"duration":"%s"}}]}
                """.formatted(embeddable, duration);
    }
}
