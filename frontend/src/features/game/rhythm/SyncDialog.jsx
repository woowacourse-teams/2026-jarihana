// 클릭음에 맞춰 눌러 입력 지연 보정값을 추천하는 진단 창이다. 연습과 공식 도전이 같이 쓰고 동작은 sync-ui.mjs가 붙인다.
export function SyncDialog() {
  return (
    <dialog
      id="sync-dialog"
      className="sync-dialog"
      aria-labelledby="sync-title"
      aria-describedby="sync-description"
    >
      <div className="sync-heading">
        <span className="eyebrow">SYNC CHECK</span>
        <h2 id="sync-title">소리에 맞춰 싱크 맞추기</h2>
      </div>
      <p id="sync-description">
        클릭음을 4박 들은 뒤, 이어지는 20박에 맞춰 눌러요. 화면의 움직임 대신 소리에만 집중해요.
      </p>
      <p className="small muted">
        기기 지연과 개인의 입력 습관이 함께 반영되는 추천값이에요. 리듬감 점수나 기기 자체의 지연
        측정값은 아니에요.
      </p>
      <div className="sync-volume">
        <label htmlFor="sync-volume">
          진단 음량 <output id="sync-volume-value">50%</output>
        </label>
        <input
          id="sync-volume"
          data-ph-capture-attribute-action="rhythm_sync_volume_change"
          type="range"
          min="0"
          max="100"
          step="5"
          defaultValue="50"
        />
      </div>
      <p className="sync-current">
        현재 보정 <strong id="sync-current">0ms</strong>
      </p>
      <p id="sync-status" className="sync-status" role="status">
        측정 시작을 누르면 클릭음이 나와요.
      </p>
      <button
        id="sync-tap"
        data-ph-capture-attribute-action="rhythm_sync_tap"
        className="sync-tap"
        type="button"
        disabled
      >
        클릭음에 맞춰 누르기<small>Space / 방향키 / WASD / 터치</small>
      </button>
      <div className="sync-progress">
        <progress id="sync-progress" value="0" max="20" aria-label="입력한 박 수"></progress>
        <output id="sync-count">0 / 20</output>
      </div>
      <div id="sync-result" className="sync-result" hidden>
        <dl>
          <div>
            <dt>추천 보정</dt>
            <dd id="sync-recommendation">측정 전</dd>
          </div>
          <div>
            <dt>입력 편차</dt>
            <dd id="sync-spread">측정 전</dd>
          </div>
          <div>
            <dt>반영한 입력</dt>
            <dd id="sync-samples">0 / 20</dd>
          </div>
        </dl>
        <p className="small muted">
          몇 번의 큰 오차는 제외해요. 입력 편차가 크면 다시 측정해요. 이어폰이나 키보드를 바꾸면 다시
          진단하는 게 좋아요.
        </p>
      </div>
      <div className="sync-actions">
        <button
          id="sync-start"
          data-ph-capture-attribute-action="rhythm_sync_start"
          className="button primary"
          type="button"
        >
          측정 시작
        </button>
        <button
          id="sync-apply"
          data-ph-capture-attribute-action="rhythm_sync_apply"
          className="button"
          type="button"
          disabled
        >
          추천값 적용
        </button>
        <button
          id="sync-close"
          data-ph-capture-attribute-action="rhythm_sync_close"
          className="button subtle"
          type="button"
        >
          닫기
        </button>
      </div>
    </dialog>
  );
}
