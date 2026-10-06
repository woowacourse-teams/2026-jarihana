package com.project.jarihana.pushsubscription.support;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.specification.RequestSpecification;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;

@TestPropertySource(properties = {
        "jarihana.push.enabled=true", "jarihana.push.worker-enabled=false",
        "jarihana.push.vapid-public-key=BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU",
        "jarihana.push.vapid-private-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE",
        "jarihana.push.vapid-subject=mailto:push@example.test"
})
public abstract class PushIntegrationTestSupport extends NotificationIntegrationTestSupport {

    @Autowired protected AccessTokenProvider tokens;
    @Autowired protected AuthCookieProperties cookies;

    protected RequestSpecification authenticated(Member owner) {
        return RestAssured.given().cookie(cookies.accessTokenName(), tokens.issue(owner.getId()).value());
    }

    protected RequestSpecification mutation(Member owner) {
        String csrf = RestAssured.get("/groups").cookie("XSRF-TOKEN");
        return authenticated(owner).cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
    }

    protected Map<String, Object> body(Member owner, String suffix) {
        var fixture = subscription(owner, suffix);
        return Map.of("endpoint", fixture.getEndpoint(),
                "keys", Map.of("p256dh", fixture.getP256dh(), "auth", fixture.getAuth()));
    }
}
