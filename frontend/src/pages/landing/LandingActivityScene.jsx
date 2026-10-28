import { ArrowRight, Bell, Camera, ImagePlus, MessageCircle } from "lucide-react";

import { Avatar } from "../../shared/ui";
import activityPhoto from "../../shared/assets/landing/activity-study-photo.webp";
import studyImage from "../../shared/assets/landing/default-group-study.webp";
import heartImage from "../../shared/assets/reactions/heart.webp";
import "../../features/notifications/notifications.css";
import "./landing-activity-motion.css";

const studyGroup = {
  name: "함께 배우는 토요일"
};

// 서버가 만드는 실제 알림 문구다. 하트는 읽기 전 알림을 하나로 묶어 "외 N명"으로 보여 준다.
const notifications = [
  { id: "heart", title: "좋아요", body: "모아 외 2명이 좋아요를 눌렀어요.", time: "10월 10일 오후 4:20" },
  {
    id: "comment",
    title: "새 댓글",
    body: `‘${studyGroup.name}’ 모임 활동 기록에 새 댓글이 달렸습니다.`,
    time: "10월 10일 오후 4:12"
  }
];

function ActivityNotifications() {
  return (
    <div className="lpa-notifications">
      <div className="lpa-notifications__head">
        <Bell size={18} />
        <strong>알림함</strong>
        <span className="lpa-notifications__count">{notifications.length}</span>
      </div>
      <ul className="notification-list">
        {notifications.map((item) => (
          <li className={`notification-row lpa-notification lpa-notification--${item.id}`} key={item.id}>
            <span className="notification-row__link">
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              <time>{item.time}</time>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 실제 피드처럼 다른 사람이 남긴 회색 하트 2개에 내 하트를 더해 색이 채워지고 3이 된다.
function HeartReaction({ before, after }) {
  return (
    <span className="lpa-reaction">
      <img alt="" className="lpa-reaction-heart" src={heartImage} width="96" height="96" />
      <span className="lpa-reaction-count" aria-hidden="true">
        <span className="lpa-reaction-before">{before}</span>
        <span className="lpa-reaction-after">{after}</span>
      </span>
    </span>
  );
}

export function LandingActivityScene() {
  return (
    <>
      <div className="lps-heading lps-enter lpa-heading">
        <div>
          <strong className="lps-title">활동 기록</strong>
        </div>
      </div>
      <div className="lps-activity-toolbar">
      <div className="lps-tabs lpa-tabs">
        <span className="lps-selected">전체 기록</span>
        <span>내가 쓴 기록</span>
      </div>
      <span className="lps-upload"><Camera size={16} /> 활동 올리기</span>
      </div>
      <div className="lps-feed-detail lps-enter lpa-feed-detail">
        <div className="lps-feed-photo lpa-photo">
          <div className="lpa-upload-card">
            <span className="lpa-upload-icon">
              <ImagePlus size={20} />
            </span>
            <div>
              <strong>사진을 올리는 중</strong>
              <span>토요일 모임 사진 1장</span>
            </div>
            <span className="lpa-upload-progress">
              <span />
            </span>
          </div>
          <img
            alt=""
            className="lpa-photo-image"
            src={activityPhoto}
            width="1200"
            height="800"
            loading="lazy"
          />
          <span className="lpa-photo-badge">활동 사진</span>
        </div>
        <div className="lps-feed-conversation lpa-conversation">
          <div className="lps-feed-story lpa-story">
            <strong className="lps-story-title">
              <span>같이 설명하니 더 잘 알겠어요.</span>
            </strong>
            <span className="lps-account-meta">하루 · 2026. 10. 10.</span>
          </div>
          <div className="lps-feed-group lpa-group">
            <img alt="" src={studyImage} width="36" height="36" />
            <strong>{studyGroup.name}</strong>
            <ArrowRight size={16} />
          </div>
          <div className="lps-reactions lpa-reactions">
            <HeartReaction before="2" after="3" />
          </div>
          <div className="lps-feed-comments lpa-comments">
            <strong>
              <MessageCircle size={16} /> 댓글 <span className="lpa-comment-count"><span className="lpa-count-zero">0</span><span className="lpa-count-one">1</span><span className="lpa-count-two">2</span></span>
            </strong>
            <div className="lps-comment lpa-comment lpa-comment--first">
              <Avatar fallback="모" />
              <div>
                <strong>모아 <span>방금</span></strong>
                <p>같이 풀어보니까 이해가 쏙 됐어요!</p>
              </div>
            </div>
            <div className="lps-comment lps-comment--reply lpa-comment lpa-comment--second">
              <Avatar fallback="하" />
              <div>
                <strong>하루 <span>방금</span></strong>
                <p>다음 토요일에도 같이 공부해요.</p>
              </div>
            </div>
          </div>
          <div className="lps-comment-composer lpa-composer">
            <span className="lpa-composer-placeholder">댓글을 남겨 보세요.</span>
            <span className="lpa-composer-typing lpa-composer-typing--first">
              같이 풀어보니까 이해가 쏙 됐어요!
            </span>
            <span className="lpa-composer-typing lpa-composer-typing--second">
              다음 토요일에도 같이 공부해요.
            </span>
            <span className="lpa-submit">등록</span>
          </div>
        </div>
      </div>
      <ActivityNotifications />
    </>
  );
}
