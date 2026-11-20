function ClassicStone() {
  return <span className="gomoku-stone__classic" />;
}
export const classicStoneRenderers = Object.freeze({ classic: ClassicStone });
export function Stone({
  color,
  appearance = "classic",
  renderers = classicStoneRenderers,
  last = false
}) {
  const Renderer = renderers[appearance] ?? ClassicStone;
  return (
    <span aria-hidden="true" className={`gomoku-stone gomoku-stone--${color.toLowerCase()}`}>
      <span className="gomoku-stone__art">
        <Renderer color={color} />
      </span>
      {last && <span className="gomoku-stone__last" />}
    </span>
  );
}
