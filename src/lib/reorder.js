// Working out the new `order` values when someone drags a project up or down.
//
// Kept apart from the component and from Firebase so the arithmetic can be
// tested directly. The rules it has to satisfy:
//
//   - the dragged project lands immediately before the one it was dropped on,
//     which is what the drop indicator above that row promises
//   - every other project keeps its relative position
//   - only projects whose order actually changes are written. A drag near the
//     bottom of a long list should not rewrite the whole pipeline, and each
//     write is a document anyone watching the list receives
//   - the result is a clean 0..n-1 sequence, so repeated drags cannot drift
//     into ties or leave gaps that later reads have to guess about
//
// `items` is the full list for one brand and track, in the order shown.

export function planReorder({ items, sourceId, targetId }) {
  if (!sourceId || !targetId || sourceId === targetId) return [];

  const from = items.findIndex((p) => p.id === sourceId);
  const to = items.findIndex((p) => p.id === targetId);
  if (from < 0 || to < 0) return [];

  const next = [...items];
  const [item] = next.splice(from, 1);
  // Removing the dragged project first shifts everything after it left by
  // one, so a downward move has to insert one place earlier than the target's
  // original index -- otherwise it lands after the row it was dropped on
  // rather than before it, which is not what the drop indicator showed.
  next.splice(to > from ? to - 1 : to, 0, item);

  // Dropping a row onto the one directly below it puts it back where it
  // started, which is a no-op rather than a change to save.
  const moved = [];
  next.forEach((p, i) => {
    if (p.order !== i) moved.push({ id: p.id, order: i });
  });
  return moved;
}
