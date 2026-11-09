// Pack only selected parts into the draw range. Logical slot/part ids remain stable
// while physical instance indices can move when an avatar changes or leaves.
export function createAvatarInstanceBatch(mesh, bends, stride) {
  const ids = [], locations = new Map(), slots = new Map();
  mesh.userData.avatarInstanceIds = ids;
  mesh.userData.avatarStride = stride;

  function remove(id) {
    const index = locations.get(id);
    if (index === undefined) return;
    const last = ids.length - 1;
    if (index !== last) {
      mesh.instanceMatrix.array.copyWithin(index * 16, last * 16, last * 16 + 16);
      if (mesh.instanceColor) mesh.instanceColor.array.copyWithin(index * 3, last * 3, last * 3 + 3);
      if (bends) bends.setX(index, bends.getX(last));
      ids[index] = ids[last]; locations.set(ids[index], index);
    }
    ids.pop(); locations.delete(id);
  }

  function update(slot, parts, color) {
    const next = new Set(parts.map(({ partIndex }) => slot * stride + partIndex));
    for (const id of slots.get(slot) ?? []) if (!next.has(id)) remove(id);
    if (next.size) slots.set(slot, next); else slots.delete(slot);
    for (const { partIndex, node } of parts) {
      const id = slot * stride + partIndex;
      let index = locations.get(id);
      const added = index === undefined;
      if (added) { index = ids.length; ids.push(id); locations.set(id, index); }
      mesh.setMatrixAt(index, node.matrixWorld);
      if (color || added) mesh.setColorAt(index, color);
      bends?.setX(index, node.userData.bendJoint?.rotation.x ?? 0);
    }
    mesh.count = ids.length;
    mesh.visible = ids.length > 0;
    for (const attribute of [mesh.instanceMatrix, mesh.instanceColor, bends].filter(Boolean)) {
      attribute.clearUpdateRanges();
      if (mesh.count) attribute.addUpdateRange(0, mesh.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    mesh.boundingSphere = null;
  }
  return { update, hide: slot => update(slot, [], null) };
}
