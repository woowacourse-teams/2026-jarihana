const SIZE = 15;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const inside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
const empty = (cells, x, y) => inside(x, y) && cells[y * SIZE + x] === "0";
const groupKey = (stones) => stones.sort((a, b) => a - b).join(",");

function line(cells, x, y, [dx, dy]) {
  let count = 1;
  for (const sign of [-1, 1]) {
    let px = x + sign * dx;
    let py = y + sign * dy;
    while (inside(px, py) && cells[py * SIZE + px] === "1") {
      count += 1;
      px += sign * dx;
      py += sign * dy;
    }
  }
  return count;
}

function hasLine(cells, x, y, length, exact) {
  return DIRECTIONS.some((direction) => {
    const count = line(cells, x, y, direction);
    return exact ? count === length : count >= length;
  });
}

function fours(cells, x, y) {
  const groups = new Set();
  for (const direction of DIRECTIONS) {
    const [dx, dy] = direction;
    for (let start = -4; start <= 0; start += 1) {
      const stones = [];
      let gap = -1;
      let valid = true;
      for (let i = 0; i < 5; i += 1) {
        const px = x + (start + i) * dx;
        const py = y + (start + i) * dy;
        if (!inside(px, py)) { valid = false; break; }
        const index = py * SIZE + px;
        if (cells[index] === "1" && stones.length < 4) stones.push(index);
        else if (cells[index] === "0" && gap < 0) gap = index;
        else { valid = false; break; }
      }
      if (!valid || stones.length !== 4 || gap < 0) continue;
      cells[gap] = "1";
      if (line(cells, gap % SIZE, Math.floor(gap / SIZE), direction) === 5)
        groups.add(groupKey(stones));
      cells[gap] = "0";
    }
  }
  return groups;
}

function completesFive(cells, x, y, direction) {
  cells[y * SIZE + x] = "1";
  const five = line(cells, x, y, direction) === 5;
  cells[y * SIZE + x] = "0";
  return five;
}

function threes(cells, x, y, memo) {
  const groups = new Set();
  for (const direction of DIRECTIONS) {
    const [dx, dy] = direction;
    for (let start = -3; start <= 0; start += 1) {
      const beforeX = x + (start - 1) * dx;
      const beforeY = y + (start - 1) * dy;
      const afterX = x + (start + 4) * dx;
      const afterY = y + (start + 4) * dy;
      if (!empty(cells, beforeX, beforeY) || !empty(cells, afterX, afterY)) continue;
      const stones = [];
      let gap = -1;
      let valid = true;
      for (let i = 0; i < 4; i += 1) {
        const index = (y + (start + i) * dy) * SIZE + x + (start + i) * dx;
        if (cells[index] === "1" && stones.length < 3) stones.push(index);
        else if (cells[index] === "0" && gap < 0) gap = index;
        else { valid = false; break; }
      }
      if (!valid || stones.length !== 3 || gap < 0) continue;
      cells[gap] = "1";
      const gx = gap % SIZE;
      const gy = Math.floor(gap / SIZE);
      if (
        !hasLine(cells, gx, gy, 5, true) &&
        completesFive(cells, beforeX, beforeY, direction) &&
        completesFive(cells, afterX, afterY, direction) &&
        !forbidden(cells, gx, gy, memo)
      ) groups.add(groupKey(stones));
      cells[gap] = "0";
      if (groups.size >= 2) return groups;
    }
  }
  return groups;
}

function forbidden(cells, x, y, memo) {
  const key = `${cells.join("")}:${x}:${y}`;
  if (memo.has(key)) return memo.get(key);
  let reason = null;
  if (!hasLine(cells, x, y, 5, true)) {
    if (hasLine(cells, x, y, 6, false)) reason = "장목";
    else if (fours(cells, x, y).size >= 2) reason = "쌍4";
    else if (threes(cells, x, y, memo).size >= 2) reason = "쌍3";
  }
  memo.set(key, reason);
  return reason;
}

// Mirrors GomokuBoard's Renju rules for guidance; the server still authorizes every move.
export function findForbiddenMoves(encoded) {
  const cells = encoded.split("");
  const result = new Map();
  if (cells.filter((cell) => cell === "1").length < 4) return result;
  const memo = new Map();
  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] !== "0") continue;
    cells[index] = "1";
    const reason = forbidden(cells, index % SIZE, Math.floor(index / SIZE), memo);
    cells[index] = "0";
    if (reason) result.set(index, reason);
  }
  return result;
}
