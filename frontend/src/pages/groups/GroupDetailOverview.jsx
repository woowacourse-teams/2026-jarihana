import { CalendarDays, ChevronRight, ImagePlus, MapPin } from "lucide-react";
import { Link } from "react-router";
import { useInfiniteActivityPosts } from "../../features/activity-post/hooks.js";
import { scheduleLines } from "./pageUtils.js";

export function GroupRecentActivities({ auth, groupId, onOpenActivities }) {
  const viewerKey = auth.status === "authenticated" ? auth.member?.id ?? "authenticated" : auth.status;
  const list = useInfiniteActivityPosts({ groupId, viewerKey, enabled: auth.status !== "loading" && !auth.logoutPending });
  const records = (list.data?.pages.flatMap((page) => page.items) ?? []).slice(0, 5);

  return <section className="group-detail-recent" aria-labelledby="group-detail-recent-title">
    <header className="group-detail-recent__header">
      <h2 id="group-detail-recent-title">최근 활동 기록</h2>
      <button type="button" data-ph-capture-attribute-action="group_activities_open" onClick={onOpenActivities}>
        더보기<ChevronRight size={16} aria-hidden="true" />
      </button>
    </header>
    {list.isPending ? <div className="group-detail-recent__state" role="status">활동 기록을 불러오는 중…</div> :
      list.isError ? <div className="group-detail-recent__state">
        {[401, 403].includes(list.error?.status) ? <p>모임에 참여한 뒤 활동 기록을 볼 수 있어요.</p> : <>
          <p>활동 기록을 불러오지 못했어요.</p>
          <button type="button" data-ph-capture-attribute-action="group_activity_retry" onClick={() => void list.refetch()}>다시 시도</button>
        </>}
      </div> : records.length > 0 ? <div className="group-detail-recent__collage" data-count={records.length}>
        {records.map((post, index) => <Link key={post.id} to={`?tab=activities&post=${post.id}`} preventScrollReset
          className={`group-detail-recent__record${index === 0 ? " group-detail-recent__record--featured" : ""}`}
          data-ph-capture-attribute-action="group_activity_open">
          <img src={post.imageUrl} alt="" loading="lazy" />
          <span className="group-detail-recent__caption"><strong>{post.caption?.trim() || "함께한 활동"}</strong>
            {post.activityDate && <time dateTime={post.activityDate}>{post.activityDate}</time>}
          </span>
        </Link>)}
      </div> : <div className="group-detail-recent__state">
        <ImagePlus size={32} aria-hidden="true" /><p>아직 남긴 활동 기록이 없어요.</p>
      </div>}
  </section>;
}

export function GroupScheduleSummary({ group, onOpenSchedule }) {
  return <section className="group-detail-schedule" aria-labelledby="group-detail-schedule-title">
    <header className="group-detail-schedule__header">
      <h2 id="group-detail-schedule-title">모임 일정</h2>
      <button type="button" data-ph-capture-attribute-action="group_schedule_open" onClick={onOpenSchedule}>
        자세히<ChevronRight size={16} aria-hidden="true" />
      </button>
    </header>
    <dl className="group-detail-schedule__details">
      <div><dt><CalendarDays size={20} aria-hidden="true" />활동 일정</dt>
        <dd>{scheduleLines(group).map((line) => <span key={line}>{line}</span>)}</dd></div>
      <div><dt><MapPin size={20} aria-hidden="true" />모임 장소</dt>
        <dd>{group.location || "아직 정해지지 않았어요"}</dd></div>
    </dl>
  </section>;
}
