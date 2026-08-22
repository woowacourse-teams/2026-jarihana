import imageIcon from "../../shared/assets/figma/edit-07.svg";

export function RepresentativeImage({ group }) {
  const imageUrl = group.representativeImageUrl || "/images/default-group.png";

  return (
    <aside className="group-editor__image-panel" aria-label="대표 이미지">
      <div className="group-editor__image-art">
        <img
          className="group-editor__representative-image"
          src={imageUrl}
          alt={`${group.name} 대표`}
        />
      </div>
      <div className="group-editor__image-footer">
        <strong>{group.name}</strong>
        <button
          className="group-editor__image-change"
          disabled
          title="대표 이미지 업로드 API가 준비되면 사용할 수 있어요."
          type="button"
        >
          <img alt="" aria-hidden="true" src={imageIcon} />
          대표 이미지 변경
        </button>
      </div>
      <p>대표 이미지 업로드 API가 준비되면 변경할 수 있어요.</p>
    </aside>
  );
}
