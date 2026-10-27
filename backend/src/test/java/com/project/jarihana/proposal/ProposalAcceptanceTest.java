package com.project.jarihana.proposal;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ProposalAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("로그인 회원이 모임을 제안하면 누구나 목록과 상세에서 볼 수 있다.")
    @Test
    void createsProposalAndShowsItToEveryone() {
        // Given
        Member author = saveMember("모카", "proposal-create-author");

        // When
        long proposalId = authorized(author)
                .contentType("application/json")
                .body(Map.of(
                        "category", "CULTURE",
                        "title", "  각자 읽고 같이 나누는 독서 모임  ",
                        "content", "완독하지 않아도 괜찮아요.",
                        "moodOptions", List.of("자유 도서", "지정 도서", "초보 환영")
                ))
                .when()
                .post("/proposals")
                .then()
                .statusCode(201)
                .body("success", equalTo(true))
                .extract()
                .jsonPath()
                .getLong("data.id");

        // Then
        given()
                .when()
                .get("/proposals")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) proposalId))
                .body("data.items[0].category", equalTo("CULTURE"))
                .body("data.items[0].title", equalTo("각자 읽고 같이 나누는 독서 모임"))
                .body("data.items[0].content", equalTo("완독하지 않아도 괜찮아요."))
                .body("data.items[0].authorNickname", equalTo("모카"))
                .body("data.items[0].authorAvatarUrl",
                        equalTo("https://avatars.githubusercontent.com/u/proposal-create-author"))
                .body("data.items[0].interestCount", equalTo(0))
                .body("data.items[0].commentCount", equalTo(0))
                .body("data.items[0].interested", equalTo(false))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue());
        given()
                .when()
                .get("/proposals/{proposalId}", proposalId)
                .then()
                .statusCode(200)
                .body("data.moodOptions", contains("자유 도서", "지정 도서", "초보 환영"))
                .body("data.interestCount", equalTo(0))
                .body("data.timeSlotCounts.timeSlot",
                        contains("WEEKDAY_MORNING", "WEEKDAY_EVENING", "WEEKEND_MORNING", "WEEKEND_AFTERNOON"))
                .body("data.timeSlotCounts.count", contains(0, 0, 0, 0))
                .body("data.meetingModeCounts.meetingMode", contains("ONLINE", "OFFLINE"))
                .body("data.moodCounts", contains(0, 0, 0))
                .body("data.myInterest", nullValue())
                .body("data.canDelete", equalTo(false));
        withToken(author)
                .when()
                .get("/proposals/{proposalId}", proposalId)
                .then()
                .statusCode(200)
                .body("data.canDelete", equalTo(true));
    }

    @DisplayName("목록에서 마음만 보내고 상세에서 조건을 더하면 하나의 응답으로 모이고, 취소하면 빠진다.")
    @Test
    void collectsOneInterestPerMemberWithConditions() {
        // Given
        Member author = saveMember("모카", "interest-author");
        Member first = saveMember("하루", "interest-first");
        Member second = saveMember("리프", "interest-second");
        long proposalId = createProposal(author, "CULTURE", "독서 모임", List.of("자유 도서", "지정 도서", "초보 환영"));

        // When
        saveInterest(first, proposalId, Map.of()).then().statusCode(204);
        saveInterest(second, proposalId, Map.of(
                "timeSlots", List.of("WEEKDAY_EVENING", "WEEKEND_MORNING"),
                "meetingModes", List.of("ONLINE"),
                "moodIndexes", List.of(0, 2)
        )).then().statusCode(204);
        saveInterest(second, proposalId, Map.of(
                "timeSlots", List.of("WEEKDAY_EVENING"),
                "meetingModes", List.of("OFFLINE", "ONLINE"),
                "moodIndexes", List.of(1)
        )).then().statusCode(204);

        // Then
        withToken(second)
                .when()
                .get("/proposals/{proposalId}", proposalId)
                .then()
                .statusCode(200)
                .body("data.interestCount", equalTo(2))
                .body("data.timeSlotCounts.count", contains(0, 1, 0, 0))
                .body("data.meetingModeCounts.count", contains(1, 1))
                .body("data.moodCounts", contains(0, 1, 0))
                .body("data.myInterest.timeSlots", contains("WEEKDAY_EVENING"))
                .body("data.myInterest.meetingModes", contains("ONLINE", "OFFLINE"))
                .body("data.myInterest.moodIndexes", contains(1));
        withToken(first)
                .when()
                .get("/proposals/{proposalId}", proposalId)
                .then()
                .body("data.myInterest.timeSlots", empty())
                .body("data.myInterest.moodIndexes", empty());
        withToken(first)
                .when()
                .get("/proposals")
                .then()
                .body("data.items[0].interestCount", equalTo(2))
                .body("data.items[0].interested", equalTo(true));

        authorized(first).when().delete("/proposals/{proposalId}/interest", proposalId).then().statusCode(204);
        authorized(first).when().delete("/proposals/{proposalId}/interest", proposalId).then().statusCode(204);
        withToken(first)
                .when()
                .get("/proposals/{proposalId}", proposalId)
                .then()
                .body("data.interestCount", equalTo(1))
                .body("data.myInterest", nullValue());
    }

    @DisplayName("없는 분위기 선택지, 모르는 조건, 비로그인, 지운 제안에는 응답할 수 없다.")
    @Test
    void rejectsInvalidInterest() {
        // Given
        Member author = saveMember("모카", "invalid-interest-author");
        Member member = saveMember("하루", "invalid-interest-member");
        long proposalId = createProposal(author, "STUDY", "코드 리뷰", List.of());

        // When & Then
        saveInterest(member, proposalId, Map.of("moodIndexes", List.of(0)))
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        saveInterest(member, proposalId, Map.of("timeSlots", List.of("MIDNIGHT")))
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        String csrfToken = csrfToken();
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body(Map.of())
                .when()
                .put("/proposals/{proposalId}/interest", proposalId)
                .then()
                .statusCode(401);

        authorized(author).when().delete("/proposals/{proposalId}", proposalId).then().statusCode(204);
        saveInterest(member, proposalId, Map.of())
                .then()
                .statusCode(404)
                .body("error.code", equalTo("PROPOSAL_NOT_FOUND"));
    }

    @DisplayName("분야로 거르고 최신순으로 커서를 따라 이어서 조회한다.")
    @Test
    void filtersByCategoryAndPagesByCursor() {
        // Given
        Member author = saveMember("모카", "page-author");
        long olderCulture = createProposal(author, "CULTURE", "먼저 쓴 문화 제안", List.of());
        createProposal(author, "STUDY", "스터디 제안", List.of());
        long newerCulture = createProposal(author, "CULTURE", "나중에 쓴 문화 제안", List.of());

        // When
        String cursor = given()
                .queryParam("category", "CULTURE")
                .queryParam("size", 1)
                .when()
                .get("/proposals")
                .then()
                .statusCode(200)
                .body("data.items.id", contains((int) newerCulture))
                .body("data.hasNext", equalTo(true))
                .extract()
                .path("data.nextCursor");

        // Then
        given()
                .queryParam("category", "CULTURE")
                .queryParam("size", 1)
                .queryParam("cursor", cursor)
                .when()
                .get("/proposals")
                .then()
                .statusCode(200)
                .body("data.items.id", contains((int) olderCulture))
                .body("data.hasNext", equalTo(false));
        given()
                .queryParam("category", "MUSIC")
                .when()
                .get("/proposals")
                .then()
                .statusCode(400);
        given()
                .queryParam("cursor", "not-a-cursor")
                .when()
                .get("/proposals")
                .then()
                .statusCode(400);
    }

    @DisplayName("제안한 회원만 제안을 지울 수 있고, 지운 제안은 목록과 상세에서 사라진다.")
    @Test
    void onlyAuthorDeletesProposal() {
        // Given
        Member author = saveMember("모카", "delete-author");
        Member other = saveMember("하루", "delete-other");
        long proposalId = createProposal(author, "SPORT", "아침 러닝", List.of());

        // When & Then
        authorized(other)
                .when()
                .delete("/proposals/{proposalId}", proposalId)
                .then()
                .statusCode(403)
                .body("error.code", equalTo("PROPOSAL_ACCESS_DENIED"));
        authorized(author).when().delete("/proposals/{proposalId}", proposalId).then().statusCode(204);
        given().when().get("/proposals/{proposalId}", proposalId).then().statusCode(404);
        given().when().get("/proposals").then().body("data.items", empty());
    }

    @DisplayName("로그인 회원은 코멘트를 남기고, 코멘트 작성자와 제안한 회원만 지울 수 있다.")
    @Test
    void writesAndDeletesComments() {
        // Given
        Member author = saveMember("모카", "comment-author");
        Member writer = saveMember("하루", "comment-writer");
        Member other = saveMember("리프", "comment-other");
        long proposalId = createProposal(author, "CULTURE", "독서 모임", List.of());

        // When
        long commentId = writeComment(writer, proposalId, "  평일 저녁이면 함께할래요  ")
                .then()
                .statusCode(201)
                .extract()
                .jsonPath()
                .getLong("data.id");

        // Then
        given()
                .when()
                .get("/proposals/{proposalId}/comments", proposalId)
                .then()
                .statusCode(200)
                .body("data.items[0].content", equalTo("평일 저녁이면 함께할래요"))
                .body("data.items[0].authorNickname", equalTo("하루"))
                .body("data.items[0].canDelete", equalTo(false));
        withToken(author)
                .when()
                .get("/proposals/{proposalId}/comments", proposalId)
                .then()
                .body("data.items[0].canDelete", equalTo(true));
        given().when().get("/proposals").then().body("data.items[0].commentCount", equalTo(1));

        authorized(other)
                .when()
                .delete("/proposal-comments/{commentId}", commentId)
                .then()
                .statusCode(403)
                .body("error.code", equalTo("PROPOSAL_COMMENT_ACCESS_DENIED"));
        authorized(author).when().delete("/proposal-comments/{commentId}", commentId).then().statusCode(204);
        given()
                .when()
                .get("/proposals/{proposalId}/comments", proposalId)
                .then()
                .body("data.items", empty());
        given().when().get("/proposals/{proposalId}", proposalId).then().body("data.commentCount", equalTo(0));
    }

    @DisplayName("비어 있거나 너무 긴 코멘트, 비로그인 코멘트는 거부한다.")
    @Test
    void rejectsInvalidComments() {
        // Given
        Member author = saveMember("모카", "invalid-comment-author");
        long proposalId = createProposal(author, "CULTURE", "독서 모임", List.of());

        // When & Then
        writeComment(author, proposalId, "   ").then().statusCode(400);
        writeComment(author, proposalId, "가".repeat(301)).then().statusCode(400);
        String csrfToken = csrfToken();
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body(Map.of("content", "안녕하세요"))
                .when()
                .post("/proposals/{proposalId}/comments", proposalId)
                .then()
                .statusCode(401);
    }

    @DisplayName("분야가 없거나 제목이 길거나 분위기 선택지가 많은 제안, 비로그인 제안은 거부한다.")
    @Test
    void rejectsInvalidProposals() {
        // Given
        Member author = saveMember("모카", "invalid-proposal-author");

        // When & Then
        authorized(author)
                .contentType("application/json")
                .body(Map.of("title", "제목", "content", "내용"))
                .when()
                .post("/proposals")
                .then()
                .statusCode(400);
        authorized(author)
                .contentType("application/json")
                .body(Map.of("category", "STUDY", "title", "가".repeat(51), "content", "내용"))
                .when()
                .post("/proposals")
                .then()
                .statusCode(400);
        authorized(author)
                .contentType("application/json")
                .body(Map.of(
                        "category", "STUDY",
                        "title", "제목",
                        "content", "내용",
                        "moodOptions", List.of("하나", "둘", "셋", "넷")
                ))
                .when()
                .post("/proposals")
                .then()
                .statusCode(400);
        String csrfToken = csrfToken();
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .contentType("application/json")
                .body(Map.of("category", "STUDY", "title", "제목", "content", "내용"))
                .when()
                .post("/proposals")
                .then()
                .statusCode(401);
    }

    @DisplayName("분위기 선택지나 응답 조건에 빈 값이 섞이면 서버 오류가 아니라 잘못된 요청으로 거부한다.")
    @Test
    void rejectsNullElementsAsInvalidParameter() {
        // Given
        Member author = saveMember("모카", "null-element-author");
        long proposalId = createProposal(author, "CULTURE", "독서 모임", List.of("자유 도서"));

        // When & Then
        authorized(author)
                .contentType("application/json")
                .body("""
                        {"category": "STUDY", "title": "제목", "content": "내용", "moodOptions": [null]}
                        """)
                .when()
                .post("/proposals")
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        for (String conditions : List.of(
                "{\"timeSlots\": [null]}",
                "{\"meetingModes\": [null]}",
                "{\"moodIndexes\": [null]}"
        )) {
            authorized(author)
                    .contentType("application/json")
                    .body(conditions)
                    .when()
                    .put("/proposals/{proposalId}/interest", proposalId)
                    .then()
                    .statusCode(400)
                    .body("error.code", equalTo("INVALID_PARAMETER"));
        }
    }

    private long createProposal(Member author, String category, String title, List<String> moodOptions) {
        return authorized(author)
                .contentType("application/json")
                .body(Map.of(
                        "category", category,
                        "title", title,
                        "content", title + " 함께해요",
                        "moodOptions", moodOptions
                ))
                .when()
                .post("/proposals")
                .then()
                .statusCode(201)
                .extract()
                .jsonPath()
                .getLong("data.id");
    }

    private Response saveInterest(Member member, long proposalId, Map<String, Object> body) {
        return authorized(member)
                .contentType("application/json")
                .body(body)
                .when()
                .put("/proposals/{proposalId}/interest", proposalId);
    }

    private Response writeComment(Member member, long proposalId, String content) {
        return authorized(member)
                .contentType("application/json")
                .body(Map.of("content", content))
                .when()
                .post("/proposals/{proposalId}/comments", proposalId);
    }

    private Member saveMember(String nickname, String githubId) {
        return memberRepository.save(Member.create(nickname, 8, githubId, Course.BACKEND));
    }

    private RequestSpecification withToken(Member member) {
        return given().cookie(authCookieProperties.accessTokenName(), token(member));
    }

    private RequestSpecification authorized(Member member) {
        String csrfToken = csrfToken();
        return given()
                .cookie(authCookieProperties.accessTokenName(), token(member))
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken);
    }

    private String token(Member member) {
        return accessTokenProvider.issue(member.getId()).value();
    }

    private String csrfToken() {
        return given()
                .when()
                .get("/proposals")
                .then()
                .extract()
                .cookie("XSRF-TOKEN");
    }
}
