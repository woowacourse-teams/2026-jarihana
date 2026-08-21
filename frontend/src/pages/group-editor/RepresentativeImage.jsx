export function RepresentativeImage({ group }) {
  const imageUrl = group.representativeImageUrl || "/images/default-group.png";

  return (
    <aside className="group-editor__image-panel" aria-label="읽기 전용 대표 이미지">
      <img
        className="group-editor__representative-image"
        src={imageUrl}
        alt={`${group.name} 대표`}
      />
      <strong>{group.name}</strong>
      <p>대표 이미지는 서버에서 제공하는 이미지를 사용해요.</p>
    </aside>
  );
}
