import {
  CalendarDays,
  Check,
  ChevronDown,
  Link2,
  MapPin,
  Search,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";

import { Avatar, GroupImage, StatusBadge } from "../../shared/ui";
import { DiscoveryGroupCard } from "../groups/home/DiscoveryGroupCard";
import "../groups/home/discovery.css";
import recruitmentImage from "../../shared/assets/illustrations/group-recruitment-open.webp";
import studyImage from "../../shared/assets/landing/default-group-study.webp";
import { LandingActivityScene } from "./LandingActivityScene";
import "./landing-product-scene.css";
import "./landing-guide-motion.css";

const studyGroup = {
  id: "landing-study-example",
  type: "STUDY",
  name: "함께 배우는 토요일",
  introduction: "같은 목표, 서로 다른 생각.",
  recruiting: true,
  location: "강남역 스터디룸",
  recurringSchedule: { daysOfWeek: ["SATURDAY"], startTime: "14:00:00", endTime: "16:00:00" },
  activeRecruitment: { capacity: 6, approvedCount: 5 }
};

const bookGroup = {
  id: "landing-book-example",
  type: "CLUB",
  name: "책으로 만나는 사이",
  introduction: "좋아하는 문장을 나눠요.",
  location: "성수 북카페",
  recurringSchedule: { daysOfWeek: ["SATURDAY"], startTime: "16:00:00", endTime: "18:00:00" }
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
    <div className="groups-discovery-section lps-browse">
      <SceneHeading>자리 둘러보기</SceneHeading>
      <div className="lps-discovery-tools lps-enter">
        <div className="groups-discovery-search__control">
          <span className="lpm-type" style={{ "--motion-delay": "0.65s" }}>함께</span>
          <Search size={20} />
        </div>
        <div className="groups-discovery-filter">
          <div className="groups-discovery-filter__field"><span>모임 유형</span><div className="groups-discovery-filter__select"><span className="lps-filter-value">전체</span></div></div>
          <div className="groups-discovery-filter__field"><span>모임 상태</span><div className="groups-discovery-filter__select"><span className="lps-filter-value">활동 중</span></div></div>
          <div className="groups-discovery-filter__field"><span>모집 상태</span><div className="groups-discovery-filter__select"><MotionSwap className="lps-filter-value" before="전체" after="모집 중" delay="1.8s" /></div></div>
        </div>
      </div>
      <div className="lps-discovery-cards">
        <div className="lpm-arrive lpm-card-focus" style={{ "--motion-delay": "2.4s" }}>
          <DiscoveryGroupCard as={CardSurface} group={studyGroup} recruiting />
        </div>
        <div className="lpm-arrive" style={{ "--motion-delay": "2.6s" }}>
          <DiscoveryGroupCard as={CardSurface} group={{ ...bookGroup, name: "함께 읽는 토요일", activeRecruitment: { capacity: 8, approvedCount: 5 } }} recruiting />
        </div>
      </div>
    </div>
  );
}

function DetailScene() {
  return (
    <>
      <div className="lps-detail-hero lps-enter">
        <img alt="" src={studyImage} className="lps-detail-hero__image" />
        <span className="lps-eyebrow">스터디</span>
        <strong className="lps-title">{studyGroup.name}</strong>
        <p>{studyGroup.introduction}</p>
        <strong>모임 정보</strong>
        <div className="lps-detail-info">
          <span><CalendarDays size={16} /> 매주 토 · 14:00–16:00</span>
          <span><MapPin size={16} /> 강남역 스터디룸</span>
          <span><UsersRound size={16} /> 참여 5명</span>
        </div>
      </div>
      <div className="lps-tabs"><span className="lps-selected">소개</span><span>캘린더</span><span>활동 기록</span><span>참여자</span></div>
      <div className="lps-recruitment lpm-emphasis" style={{ "--motion-delay": "0.8s" }}>
        <img alt="" src={recruitmentImage} className="lps-recruitment-image" />
        <dl><div><dt>참여 방식</dt><dd>승인제</dd></div><div><dt>모집 인원</dt><dd>승인 5명 / 정원 6명</dd></div></dl>
        <div className="lps-seat-meter"><span /></div>
        <MotionSwap className="lps-action" delay="4.3s" before="신청하기" after="신청 완료" />
      </div>
      <div className="lps-application-overlay">
        <div className="lps-application lps-panel">
          <SceneHeading trailing={<X size={20} />}>신청</SceneHeading>
          <p className="lps-body">운영자에게 전달할 신청 메시지를 작성해 주세요.</p>
          <span className="lps-label">신청 메시지</span>
          <p className="lps-application-message"><span className="lpm-type" style={{ "--motion-delay": "2s", "--type-duration": "1.4s" }}>혼자 공부하던 내용을 함께 나누고 싶어요.</span></p>
          <span className="lps-account-meta">운영자에게 전하고 싶은 내용을 적어주세요.</span>
          <span className="lps-action lpm-submit" style={{ "--motion-delay": "4.3s" }}>신청하기</span>
        </div>
      </div>
    </>
  );
}

function ContinueScene() {
  return (
    <>
      <SceneHeading>마이페이지</SceneHeading>
      <p className="lps-account-description">가입한 모임과 신청 내역을 한곳에서 확인하세요.</p>
      <div className="lps-account-layout">
      <div className="lps-profile lps-enter">
        <span className="lps-eyebrow">나의 프로필</span>
        <Avatar fallback="하" />
        <strong>하루</strong>
        <span>8기 · 백엔드</span>
      </div>
      <div className="lps-account-panels">
      <div className="lps-dashboard-panel lps-enter">
        <strong className="lps-item-title">내 모임</strong>
        <div className="lps-count-tabs">
          <span><strong>0</strong> 같이해요</span>
          <span className="lps-selected lpm-tab-focus" style={{ "--motion-delay": "0.6s" }}><strong><MotionSwap before="0" after="1" delay="1.2s" /></strong> 동아리·스터디</span>
        </div>
        <div className="lps-account-row lpm-arrive" style={{ "--motion-delay": "1.2s" }}>
          <GroupImage alt="" group={studyGroup} width="84" height="108" />
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
          <GroupImage alt="" group={bookGroup} width="84" height="108" />
          <div>
            <StatusBadge tone="warning">검토 중</StatusBadge>
            <strong>{bookGroup.name}</strong>
            <p>좋아하는 책 이야기를 나누고 싶어요.</p>
            <span className="lps-account-meta"><CalendarDays size={15} /> 2026. 10. 10. 신청</span>
          </div>
        </div>
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
        {approved ? <StatusBadge tone="brand">승인</StatusBadge> : (
          <MotionSwap delay="3.8s"
            before={<StatusBadge tone="warning">대기</StatusBadge>}
            after={<StatusBadge tone="brand">승인</StatusBadge>} />
        )}
          <strong>{name}</strong>
          <span>8기 · 백엔드 · 신청 2026. 10. 10.</span>
        </div>
      </div>
      <p className="lps-body">{children}</p>
      {approved ? (
        <span className="lps-approved">
          <Check size={17} />
          처리 2026. 10. 10.
        </span>
      ) : (
        <MotionSwap className="lpm-decision" delay="3.8s"
          before={<span className="lps-decisions"><span className="lps-selected lpm-approve">승인</span><span>미승인</span></span>}
          after={<span className="lps-approved">처리 2026. 10. 10.</span>} />
      )}
    </div>
  );
}

function ManageScene() {
  return (
    <>
      <SceneHeading>{studyGroup.name}</SceneHeading>
      <div className="lps-tabs lps-manage-tabs">
        <span>모임 수정</span><span>모집 관리</span><span>모집 이력</span><span className="lps-selected">신청 관리</span><span>참여자 관리</span>
      </div>
      <div className="lps-manage-layout">
      <div>
      <div className="lps-manage-toolbar"><strong>신청자 목록</strong><span>전체 <ChevronDown size={14} /></span></div>
      <Applicant name="하루">혼자 공부하던 내용을 함께 나누고 싶어요.</Applicant>
      <Applicant name="모아" approved>
        매주 작은 목표를 정하고 꾸준히 공부하고 싶어요.
      </Applicant>
      </div>
      <div className="lps-manage-summary lps-enter">
        <div><strong>모집 상태</strong><StatusBadge tone="brand">모집 중</StatusBadge></div>
        <strong>승인 <MotionSwap before="5" after="6" delay="3.8s" /> / 정원 6명</strong>
        <span>승인제</span>
      </div>
      </div>
    </>
  );
}

function InviteScene() {
  return (
    <>
      <div className="lps-invite-context"><GroupIdentity /><MotionSwap className="lps-share-button" delay="5.6s" before={<><Link2 size={16} />초대 링크 복사</>} after={<><Check size={16} />링크를 복사했어요</>} /></div>
      <div className="lps-panel lps-invite-panel lps-enter">
        <SceneHeading trailing={<X size={24} />}>멤버 초대</SceneHeading>
        <div className="lps-tabs">
          <span className="lps-selected">회원 초대</span>
          <span>보낸 초대</span>
        </div>
        <div className="lps-invite-search"><div className="lps-search">
          <span className="lpm-type" style={{ "--motion-delay": "0.6s", "--type-duration": "0.5s" }}>하루</span>
        </div><span className="lps-search-submit"><Search size={18} />검색</span></div>
        <MotionSwap delay="4.2s" after={null} before={<span className="lps-selection lpm-arrive" style={{ "--motion-delay": "2.6s" }}>
          <span>
            선택한 회원 <strong>1명</strong>
          </span>
          <span className="lps-member-chip">
            하루 <X size={14} />
          </span>
        </span>} />
        <div className="lps-candidate lpm-arrive" style={{ "--motion-delay": "1.6s" }}>
          <MotionSwap delay="4.2s"
            before={<span className="lps-checkbox lpm-check" style={{ "--motion-delay": "2.4s" }}><Check size={16} /></span>}
            after={<span className="lps-checkbox lps-checkbox--empty" />} />
          <div>
            <strong>하루</strong>
            <span>8기 · 크루 · 백엔드</span>
          </div>
        </div>
        <span className="lps-invite-summary lpm-arrive" style={{ "--motion-delay": "4.2s" }}>1명에게 초대를 보냈어요.</span>
        <div className="lps-dialog-actions"><span>닫기</span><MotionSwap className="lps-action lpm-submit" delay="4.2s"
          before={<><UserPlus size={17} />선택한 <MotionSwap before="0" after="1" delay="2.4s" />명 초대하기</>}
          after={<><UserPlus size={17} />선택한 0명 초대하기</>} /></div>
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
