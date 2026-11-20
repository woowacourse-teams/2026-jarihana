import { findForbiddenMoves } from "./forbiddenMoves";

export function board(black, white = []) {
  const cells = Array(225).fill("0");
  black.forEach(([x, y]) => { cells[y * 15 + x] = "1"; });
  white.forEach(([x, y]) => { cells[y * 15 + x] = "2"; });
  return cells.join("");
}

// These arrangements also exercise the authoritative Java GomokuBoardTest cases.
const cases = [
  ["double three", [[6,7],[8,7],[7,6],[7,8]], [], [7,7], "쌍3"],
  ["blocked three", [[6,7],[8,7],[7,6],[7,8]], [[4,7],[10,7]], [7,7], undefined],
  ["double four", [[5,7],[6,7],[8,7],[7,5],[7,6],[7,8]], [], [7,7], "쌍4"],
  ["exact five before double three", [[3,7],[4,7],[5,7],[6,7],[7,6],[7,8],[6,6],[8,8]], [], [7,7], undefined],
  ["overline", [[2,7],[3,7],[4,7],[6,7],[7,7]], [], [5,7], "장목"],
  ["five before crossing overline", [[3,7],[4,7],[5,7],[6,7],[7,4],[7,5],[7,6],[7,8],[7,9]], [], [7,7], undefined],
  ["same-direction double four", [[4,7],[6,7],[8,7],[10,7]], [], [7,7], "쌍4"],
  ["one open four with two endpoints", [[5,7],[6,7],[8,7]], [], [7,7], undefined],
  ["board edge blocks open four", [[0,7],[2,7],[1,6],[1,8]], [], [1,7], undefined],
  ["overline endpoints make a fake three", [[3,7],[6,7],[8,7],[11,7],[7,6],[7,8]], [], [7,7], undefined],
  ["one valid four continuation", [[3,7],[6,7],[8,7],[7,6],[7,8]], [], [7,7], "쌍3"],
  ["continuation already wins", [[5,7],[8,7],[7,6],[7,8],[6,3],[6,4],[6,5],[6,6]], [], [7,7], undefined],
  ["continuation is overline", [[5,7],[8,7],[7,6],[7,8],[6,2],[6,3],[6,4],[6,5],[6,6]], [], [7,7], undefined],
  ["continuation is double four", [[5,7],[8,7],[7,6],[7,8],[6,5],[6,6],[6,8]], [], [7,7], undefined],
  ["continuation is real double three", [[5,7],[8,7],[7,6],[7,8],[6,6],[6,8],[5,6]], [], [7,7], undefined],
  ["recursive fake double three", [[5,7],[8,7],[7,6],[7,8],[6,6],[6,8],[5,6],[4,0],[4,1],[4,2],[4,3],[4,4],[8,10],[8,11],[8,12],[8,13],[8,14]], [], [7,7], "쌍3"]
];

for (const transform of [(p) => p, ([x,y]) => [14-y,x], ([x,y]) => [14-x,y]]) {
  test.each(cases)("Renju guidance matches %s in every tested orientation", (_name, black, white, point, reason) => {
    const encoded = board(black.map(transform), white.map(transform));
    const [x,y] = transform(point);
    const result = findForbiddenMoves(encoded);
    expect(result.get(y * 15 + x)).toBe(reason);
    for (const index of result.keys()) expect(encoded[index]).toBe("0");
    expect(encoded).toBe(board(black.map(transform), white.map(transform)));
  });
}

test("empty boards and white-only threats have no black forbidden points", () => {
  expect(findForbiddenMoves("0".repeat(225)).size).toBe(0);
  expect(findForbiddenMoves(board([], [[6,7],[8,7],[7,6],[7,8]])).size).toBe(0);
});
