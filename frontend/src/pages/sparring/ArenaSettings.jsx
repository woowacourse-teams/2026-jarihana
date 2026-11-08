import { useId } from "react";
import { Settings } from "lucide-react";
import { Modal } from "../../shared/ui";
import "./sparring-create.css";
import "./arena-settings.css";

function SettingToggle({ label, description, checked, disabled, onClick, action }) {
  const descriptionId = useId();
  return (
    <button type="button" className="arena-settings-toggle" role="switch"
      aria-label={label} aria-checked={checked} aria-describedby={descriptionId}
      disabled={disabled} onClick={onClick} data-ph-capture-attribute-action={action}>
      <span className="arena-settings-toggle__copy">
        <strong>{label}</strong>
        <span id={descriptionId}>{description}</span>
      </span>
      <span className="arena-settings-toggle__track" aria-hidden="true" />
    </button>
  );
}

export function ArenaSettings({ ready, arenaView, changeArenaView, brawl, toggleBrawl,
  clashCamera, toggleClashCamera, characterLimits, changeCharacterLimit, speechOverlap, toggleSpeechOverlap }) {
  return (
    <Modal title="마당 설정" description="내가 보고 싶은 마당으로 바꿔봐요."
      panelClassName="sparring-create-dialog sparring-settings-dialog" closeAction="sparring_settings_dismiss"
      trigger={<button type="button" className="sparring-settings-trigger" aria-label="마당 설정 열기" title="마당 설정"
        data-ph-capture-attribute-action="sparring_experiment_menu">
        <Settings size={30} strokeWidth={2.5} aria-hidden="true" />
      </button>}>
      <div className="arena-settings">
        <fieldset className="arena-settings-view" disabled={!ready}>
          <legend>구도</legend>
          <div role="group" aria-label="경기장 구도">
            {[["compact", "아담한 구도"], ["original", "기존 구도"]].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={arenaView === value}
                onClick={() => changeArenaView(value)} data-ph-capture-attribute-action="sparring_view_change">
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <SettingToggle label="패싸움 연출" description="캐릭터들이 의자와 맨손으로 한판 붙어요."
          checked={brawl} disabled={!ready} onClick={toggleBrawl} action="sparring_brawl_toggle" />
        <SettingToggle label="받아치기 연출" description="내가 보낸 받아치기 캡슐을 카메라가 따라가요."
          checked={clashCamera} disabled={!ready} onClick={toggleClashCamera} action="sparring_clash_camera_toggle" />
        <fieldset className="arena-settings-limits" disabled={!ready}>
          <legend>팀별 최대 인원</legend>
          <p>실제 대화한 사람만 나와요. 최대 8명씩 정할 수 있어요.</p>
          <div>
            {[["a", "민트"], ["b", "코랄"]].map(([side, label]) => (
              <label key={side} data-side={side}>
                <span>{label}</span>
                <select value={characterLimits[side]} onChange={event => changeCharacterLimit(side, event.target.value)}
                  data-ph-capture-attribute-action="sparring_character_limit_change">
                  {Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}명</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        <SettingToggle label="말풍선 겹침 허용" description="켜면 캐릭터 가까이에, 끄면 덜 겹치도록 펼쳐요."
          checked={speechOverlap} disabled={!ready} onClick={toggleSpeechOverlap} action="sparring_speech_overlap_toggle" />
        <p className="arena-settings__hint">설정은 바로 적용되고, 다음에도 그대로 유지돼요.</p>
      </div>
    </Modal>
  );
}
