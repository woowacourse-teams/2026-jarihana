export function calculateActivityPhotoWallLayout({
  cardHeights,
  columnCount,
  columnGap,
  preferredColumnIndexes = [],
  rowGap,
  wallWidth
}) {
  const normalizedColumnCount = Math.max(1, Math.floor(columnCount) || 1);
  const normalizedColumnGap = Math.max(0, columnGap);
  const normalizedRowGap = Math.max(0, rowGap);
  const cardWidth = Math.max(
    0,
    (wallWidth - normalizedColumnGap * (normalizedColumnCount - 1)) / normalizedColumnCount
  );
  const columnHeights = Array(normalizedColumnCount).fill(0);
  const columnAssignments = [];
  const positions = cardHeights.map((cardHeight, cardIndex) => {
    const preferredColumn = preferredColumnIndexes[cardIndex];
    let columnIndex = Number.isInteger(preferredColumn) &&
      preferredColumn >= 0 &&
      preferredColumn < normalizedColumnCount
      ? preferredColumn
      : 0;

    if (!Number.isInteger(preferredColumn) || preferredColumn < 0 || preferredColumn >= normalizedColumnCount) {
      for (let index = 1; index < columnHeights.length; index += 1) {
        if (columnHeights[index] < columnHeights[columnIndex]) {
          columnIndex = index;
        }
      }
    }

    columnAssignments.push(columnIndex);
    const top = columnHeights[columnIndex];
    const height = Math.max(0, cardHeight);
    const position = {
      left: columnIndex * (cardWidth + normalizedColumnGap),
      top,
      width: cardWidth
    };
    columnHeights[columnIndex] += height + normalizedRowGap;
    return position;
  });

  const tallestColumn = Math.max(...columnHeights, 0);
  return {
    height: Math.max(0, tallestColumn - (positions.length > 0 ? normalizedRowGap : 0)),
    columnAssignments,
    positions
  };
}
