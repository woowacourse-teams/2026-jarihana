import { Check } from "lucide-react";
import band from "../../shared/assets/clubhouse/band.webp";
import boardgame from "../../shared/assets/clubhouse/boardgame.webp";
import climbing from "../../shared/assets/clubhouse/climbing.webp";
import dining from "../../shared/assets/clubhouse/dining.webp";
import lounge from "../../shared/assets/clubhouse/lounge.webp";
import photo from "../../shared/assets/clubhouse/photo.webp";
import study from "../../shared/assets/clubhouse/study.webp";
import { ROOM_TEMPLATES } from "./roomState.js";
import "./clubhouse-setup.css";

const previews = { band, boardgame, climbing, dining, lounge, photo, study };

export function ClubhouseThemePicker({ disabled, onSelect, selected }) {
  return (
    <div aria-label="아지트 테마" className="clubhouse-setup__cards" role="group">
      {ROOM_TEMPLATES.map(({ id, name }) => (
        <button
          aria-pressed={selected === id}
          className="clubhouse-setup__card"
          data-ph-capture-attribute-action="space_template_select"
          disabled={disabled}
          key={id}
          onClick={() => onSelect(id)}
          type="button"
        >
          <img alt="" src={previews[id]} width={384} height={351} />
          <span>{name}</span>
          {selected === id && <Check aria-hidden="true" className="clubhouse-setup__check" size={22} />}
        </button>
      ))}
    </div>
  );
}
