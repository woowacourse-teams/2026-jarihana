package com.project.jarihana.notification.support;

import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.command.repository.NotificationCommandRepository;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import com.project.jarihana.recruitment.command.repository.GroupRecruitmentCommandRepository;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

public abstract class NotificationIntegrationTestSupport extends IntegrationTestSupport {

    protected static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(HexFormat.of().parseHex(
            "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"
                    + "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"));
    private static final String AUTH = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    @Autowired protected MemberRepository members;
    @Autowired protected GroupCommandRepository groups;
    @Autowired protected GroupMemberCommandRepository groupMembers;
    @Autowired protected GroupRecruitmentCommandRepository recruitments;
    @Autowired protected NotificationCommandRepository notifications;
    @Autowired protected PushSubscriptionCommandRepository subscriptions;
    @Autowired protected JdbcTemplate jdbc;

    protected Member member(String githubId) {
        return members.save(Member.create("크루" + (char) ('가' + Integer.parseInt(githubId)), 8, githubId, Course.BACKEND));
    }

    protected GroupRecruitment recruitment(Member leader, JoinMethod method, int capacity) {
        Group group = groups.save(Group.createClub("모임" + leader.getId(), "함께해요", null, null, null, NOW.minusDays(10)));
        groupMembers.save(GroupMember.createLeader(group, leader, NOW.minusDays(10)));
        return recruitments.save(GroupRecruitment.create(group, method, capacity, NOW.minusDays(1), NOW.plusDays(7)));
    }

    protected Notification notification(Member owner, String eventKey) {
        return notifications.save(Notification.create(owner, eventKey, NotificationEventType.REGISTRATION_APPROVED,
                NotificationPayload.of(12, 45, 123, null), NOW));
    }

    protected PushSubscription subscription(Member owner, String suffix) {
        return subscriptions.save(PushSubscription.create(owner, "https://fcm.googleapis.com/" + suffix, KEY, AUTH, NOW));
    }
}
