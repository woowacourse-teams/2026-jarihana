import {
  ArrowRight,
  CalendarDays,
  Check,
  Link2,
  MapPin,
  Search,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";

import { Avatar, GroupCard, RecruitmentCard, StatusBadge } from "../../shared/ui";
import studyImage from "../../shared/assets/landing/default-group-study.webp";
import clubImage from "../../shared/assets/landing/default-group-club.webp";
import { LandingActivityScene } from "./LandingActivityScene";
import "./landing-product-scene.css";
import "./landing-guide-motion.css";

const studyGroup = {
  id: "landing-study-example",
  type: "STUDY",
  representativeImageUrl: studyImage,
  name: "함께 배우는 토요일",
  introduction: "같은 목표, 서로 다른 생각.",
  recruiting: true,
  recurringSchedule: { daysOfWeek: ["SATURDAY"] },
  activeRecruitment: { capacity: 6, approvedCount: 5 }
};

const bookGroup = {
  id: "landing-book-example",
  type: "CLUB",
  representativeImageUrl: clubImage,
  name: "책으로 만나는 사이",
  introduction: "좋아하는 문장을 나눠요."
};

function CardSurface({ children, className }) {
  return <div className={className}>{children}</div>;
}

function MotionSwap({ before, after, delay, className = "" }) {
  return (
    <span className={`lpm-swap ${className}`} style={{ "--motion-delay": delay }}>
      <span className="lpm-before">{before}</span>
      <span className="lpm-after">{after}</span>
    </span>
  );
}

function SceneHeading({ eyebrow, children, trailing }) {
  return (
    <div className="lps-heading lps-enter">
      <div>
        {eyebrow ? <span className="lps-eyebrow">{eyebrow}</span> : null}
        <strong className="lps-title">{children}</strong>
      </div>
      {trailing}
    </div>
  );
}

function GroupIdentity() {
  return (
    <div className="lps-group-identity">
      <img alt="" src={studyImage} width="56" height="56" />
      <div>
        <span className="lps-eyebrow">스터디</span>
        <strong>{studyGroup.name}</strong>
      </div>
    </div>
  );
}

function BrowseScene() {
  return (
    <>
      <SceneHeading eyebrow="모임 둘러보기">내가 찾던 모임을 만나요.</SceneHeading>
      <div className="lps-search lps-enter">
        <Search size={20} />
        <span className="lpm-type" style={{ "--motion-delay": "0.65s" }}>함께 배우는</span>
      </div>
      <div className="lps-pills lps-enter">
        <span className="lps-selected lpm-select" style={{ "--motion-delay": "1.8s" }}>스터디</span>
        <span>동아리</span>
        <span>같이해요</span>
      </div>
      <div className="lps-discovery-cards">
        <div className="lps-main-card lpm-arrive lpm-card-focus" style={{ "--motion-delay": "2.4s" }}>
          <GroupCard as={CardSurface} group={studyGroup} showScheduleMeta />
        </div>
        <div className="lps-companion-card lpm-arrive" style={{ "--motion-delay": "2.6s" }}>
          <GroupCard as={CardSurface} group={bookGroup} />
        </div>
      </div>
    </>
  );
}

function DetailScene() {
  return (
    <>
      <div className="lps-panel lps-enter">
        <GroupIdentity />
        <p className="lps-body">각자 배운 것을 나누며 함께 성장해요.</p>
        <div className="lps-detail-info">
          <span>
            <CalendarDays size={18} />
            매주 토요일 · 오후 2시
          </span>
          <span>
            <MapPin size={18} />
            잠실 캠퍼스
          </span>
          <span>
            <UsersRound size={18} />
            함께하는 참여자 5명
          </span>
        </div>
      </div>
      <div className="lps-recruitment lpm-emphasis" style={{ "--motion-delay": "0.8s" }}>
        <RecruitmentCard
          recruitment={{
            status: "OPEN",
            title: "토요일을 함께할 한 사람",
            joinMethod: "APPROVAL",
            capacity: 6
          }}
        />
        <div className="lps-seat">
          <span>5명 참여 중</span>
          <strong>1자리 남음</strong>
        </div>
        <div className="lps-seat-meter">
          <span />
        </div>
      </div>
      <div className="lps-application lps-enter">
        <span className="lps-label">신청 메시지</span>
        <p className="lps-body"><span className="lpm-type" style={{ "--motion-delay": "2s", "--type-duration": "1.4s" }}>혼자 공부하던 내용을 함께 나누고 싶어요.</span></p>
        <MotionSwap
          className="lps-action lpm-submit"
          delay="4.3s"
          before={<>참여 신청하기 <ArrowRight size={17} /></>}
          after={<><Check size={17} /> 신청 완료 · 검토 중</>}
        />
      </div>
    </>
  );
}

function ContinueScene() {
  return (
    <>
      <SceneHeading>마이페이지</SceneHeading>
      <p className="lps-account-description">가입한 모임과 신청 내역을 한곳에서 확인하세요.</p>
      <div className="lps-profile lps-enter">
        <Avatar fallback="하" />
        <div><span className="lps-eyebrow">나의 프로필</span><strong>하루</strong></div>
        <span>8기 · 백엔드</span>
      </div>
      <div className="lps-dashboard-panel lps-enter">
        <strong className="lps-item-title">내 모임</strong>
        <div className="lps-count-tabs">
          <span><strong>0</strong> 같이해요</span>
          <span className="lps-selected lpm-tab-focus" style={{ "--motion-delay": "0.6s" }}><strong><MotionSwap before="0" after="1" delay="1.2s" /></strong> 동아리·스터디</span>
        </div>
        <div className="lps-account-row lpm-arrive" style={{ "--motion-delay": "1.2s" }}>
          <img alt="" src={studyImage} width="84" height="108" />
          <div>
            <span className="lps-type-study">스터디</span>
            <strong>{studyGroup.name}</strong>
            <p>{studyGroup.introduction}</p>
            <span className="lps-account-meta"><UsersRound size={15} /> 6명</span>
          </div>
        </div>
      </div>
      <div className="lps-dashboard-panel lps-enter">
        <strong className="lps-item-title">내 신청</strong>
        <div className="lps-count-tabs">
          <span className="lps-selected lpm-tab-focus" style={{ "--motion-delay": "2.8s" }}><strong><MotionSwap before="0" after="1" delay="3.4s" /></strong> 검토 중</span>
          <span><strong>0</strong> 미승인</span>
        </div>
        <div className="lps-account-row lpm-arrive" style={{ "--motion-delay": "3.4s" }}>
          <img alt="" src={clubImage} width="84" height="108" />
          <div>
            <StatusBadge tone="warning">검토 중</StatusBadge>
            <strong>{bookGroup.name}</strong>
            <p>좋아하는 책 이야기를 나누고 싶어요.</p>
            <span className="lps-account-meta"><CalendarDays size={15} /> 2026. 10. 10. 신청</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Applicant({ name, approved, children }) {
  return (
    <div className="lps-applicant lps-enter">
      <div className="lps-person">
        <Avatar fallback={name.slice(0, 1)} />
        <div>
          <strong>{name}</strong>
          <span>8기 · 크루</span>
        </div>
        {approved ? <StatusBadge tone="brand">승인</StatusBadge> : (
          <MotionSwap delay="3.8s"
            before={<StatusBadge tone="warning">대기</StatusBadge>}
            after={<StatusBadge tone="brand">승인</StatusBadge>} />
        )}
      </div>
      <p className="lps-body">{children}</p>
      {approved ? (
        <span className="lps-approved">
          <Check size={17} />
          참여자로 함께하고 있어요.
        </span>
      ) : (
        <MotionSwap className="lpm-decision" delay="3.8s"
          before={<span className="lps-decisions"><span>미승인</span><span className="lps-selected lpm-approve"><Check size={16} />승인</span></span>}
          after={<span className="lps-approved"><Check size={17} />참여자로 함께하고 있어요.</span>} />
      )}
    </div>
  );
}

function ManageScene() {
  return (
    <>
      <SceneHeading eyebrow={studyGroup.name}>참여 신청 관리</SceneHeading>
      <div className="lps-manage-summary lps-enter">
        <span>승인제 모집</span>
        <strong>참여자 <MotionSwap before="5" after="6" delay="3.8s" /> / 6명</strong>
        <StatusBadge tone="brand">모집 중</StatusBadge>
      </div>
      <div className="lps-tabs">
        <span className="lps-selected">전체 신청</span>
        <span>대기</span>
        <span>승인</span>
      </div>
      <Applicant name="하루">혼자 공부하던 내용을 함께 나누고 싶어요.</Applicant>
      <Applicant name="모아" approved>
        매주 작은 목표를 정하고 꾸준히 공부하고 싶어요.
      </Applicant>
    </>
  );
}

function InviteScene() {
  return (
    <>
      <div className="lps-panel lps-invite-panel lps-enter">
        <SceneHeading trailing={<UserPlus size={24} />}>멤버 초대</SceneHeading>
        <div className="lps-tabs">
          <span className="lps-selected">회원 초대</span>
          <span>보낸 초대</span>
        </div>
        <div className="lps-search">
          <Search size={19} />
          <span className="lpm-type" style={{ "--motion-delay": "0.6s", "--type-duration": "0.5s" }}>하루</span>
        </div>
        <div className="lps-selection lpm-arrive" style={{ "--motion-delay": "2.6s" }}>
          <span>
            선택한 회원 <strong>1명</strong>
          </span>
          <span className="lps-member-chip">
            하루 <X size={14} />
          </span>
        </div>
        <div className="lps-candidate lpm-arrive" style={{ "--motion-delay": "1.6s" }}>
          <span className="lps-checkbox lpm-check" style={{ "--motion-delay": "2.4s" }}>
            <Check size={16} />
          </span>
          <div>
            <strong>하루</strong>
            <span>8기 · 크루 · 백엔드</span>
          </div>
        </div>
        <MotionSwap className="lps-action lpm-submit" delay="4.2s"
          before={<><UserPlus size={17} />선택한 1명 초대하기</>}
          after={<><Check size={17} />초대를 보냈어요</>} />
      </div>
      <div className="lps-share lps-enter">
        <span className="lps-share-icon">
          <Link2 size={22} />
        </span>
        <div>
          <strong>링크로 초대하기</strong>
          <MotionSwap delay="5.6s" before="초대 링크 복사" after="링크를 복사했어요" />
        </div>
      </div>
    </>
  );
}

const scenes = {
  browse: BrowseScene,
  detail: DetailScene,
  continue: ContinueScene,
  manage: ManageScene,
  invite: InviteScene,
  activity: LandingActivityScene
};

export function LandingProductScene({ screen }) {
  const Scene = scenes[screen];
  if (!Scene) return null;
  return (
    <div aria-hidden="true" className={`landing-product-scene landing-product-scene--${screen}`}>
      <Scene />
    </div>
  );
}
