// Unit tests for lib/drag.js — drag-and-drop math.
// The headline assertion is the WYSIWYG invariant: for ANY click point inside
// the node and ANY release point, the ghost's final on-screen position must
// equal the real node's final on-screen position. This was the bug v0.4.0
// shipped with — the ghost used a fixed (14,14) grip while the real node moved
// by raw pointer delta, so dropping a node "in place" sent it somewhere else.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeGhostGripOffset,
  computeFreePositionDelta,
  predictGhostFinalPosition,
  predictRealNodeFinalPosition,
} = require('../../lib/drag.js');

// ---------- computeGhostGripOffset ----------

test('grip = (0,0) when click hits the top-left corner', () => {
  const rect = { left: 100, top: 100, width: 80, height: 40 };
  const g = computeGhostGripOffset(100, 100, rect);
  assert.deepEqual(g, { x: 0, y: 0 });
});

test('grip = center when click hits the middle of the node', () => {
  const rect = { left: 100, top: 100, width: 80, height: 40 };
  const clickX = rect.left + rect.width / 2;
  const clickY = rect.top + rect.height / 2;
  const g = computeGhostGripOffset(clickX, clickY, rect);
  assert.deepEqual(g, { x: 40, y: 20 });
});

test('grip can be at any point inside the node, not just (14,14)', () => {
  const rect = { left: 200, top: 50, width: 120, height: 30 };
  // Click 5 px from the right edge, 25 px down (would have been ignored by the old constant grip)
  const g = computeGhostGripOffset(rect.left + rect.width - 5, rect.top + 25, rect);
  assert.deepEqual(g, { x: 115, y: 25 });
});

test('grip falls back to (14,14) when rect is missing', () => {
  assert.deepEqual(computeGhostGripOffset(100, 100, null), { x: 14, y: 14 });
  assert.deepEqual(computeGhostGripOffset(100, 100, undefined), { x: 14, y: 14 });
  assert.deepEqual(computeGhostGripOffset(100, 100, {}), { x: 14, y: 14 });
});

// ---------- computeFreePositionDelta ----------

test('delta is screen movement divided by scale', () => {
  const d = computeFreePositionDelta(100, 100, 250, 200, 2);
  // dx = 150, dy = 100, scale = 2 → 75, 50
  assert.deepEqual(d, { x: 75, y: 50 });
});

test('delta with scale=1 is just the screen delta', () => {
  const d = computeFreePositionDelta(0, 0, 100, 50, 1);
  assert.deepEqual(d, { x: 100, y: 50 });
});

test('delta returns null when below threshold (counts as a click, not drag)', () => {
  assert.equal(computeFreePositionDelta(100, 100, 102, 102, 1), null);
  assert.equal(computeFreePositionDelta(100, 100, 100, 100, 1), null);
});

test('delta tolerates missing lastX/Y (single-point press)', () => {
  // pointerup never fired with new coords → treat last as same as start → null
  assert.equal(computeFreePositionDelta(100, 100, undefined, undefined, 1), null);
  assert.equal(computeFreePositionDelta(100, 100, null, null, 1), null);
});

test('delta defaults to scale=1 for missing/zero/negative scale', () => {
  const d1 = computeFreePositionDelta(0, 0, 50, 50, 0);
  const d2 = computeFreePositionDelta(0, 0, 50, 50, -1);
  const d3 = computeFreePositionDelta(0, 0, 50, 50, undefined);
  assert.deepEqual(d1, { x: 50, y: 50 });
  assert.deepEqual(d2, { x: 50, y: 50 });
  assert.deepEqual(d3, { x: 50, y: 50 });
});

// ---------- WYSIWYG invariant (the headline test) ----------

function wysiwygOk(rect, clickOffsetX, clickOffsetY, dragDx, dragDy, scale) {
  const startX = rect.left + clickOffsetX;
  const startY = rect.top + clickOffsetY;
  const lastX = startX + dragDx;
  const lastY = startY + dragDy;

  const ghost = predictGhostFinalPosition(startX, startY, lastX, lastY, rect);
  const real  = predictRealNodeFinalPosition(startX, startY, lastX, lastY, rect, scale, { x: 0, y: 0 });

  // Floating point tolerance.
  return Math.abs(ghost.x - real.x) < 0.01 && Math.abs(ghost.y - real.y) < 0.01;
}

test('WYSIWYG: ghost final position matches real node final position (corner click)', () => {
  const rect = { left: 100, top: 100, width: 80, height: 40 };
  assert.ok(wysiwygOk(rect, 0, 0, 200, 150, 1), 'corner click should match');
});

test('WYSIWYG: matches for click at the dead center of the node', () => {
  const rect = { left: 100, top: 100, width: 80, height: 40 };
  assert.ok(wysiwygOk(rect, 40, 20, 200, 150, 1), 'center click should match');
});

test('WYSIWYG: matches for arbitrary click points (table)', () => {
  const rect = { left: 200, top: 50, width: 120, height: 30 };
  for (const [cx, cy, dx, dy] of [
    [0, 0, 50, 50],
    [60, 15, -100, 200],
    [119, 29, 0, -30],
    [1, 28, 999, -1],
    [55, 1, 7, 7],
  ]) {
    assert.ok(
      wysiwygOk(rect, cx, cy, dx, dy, 1),
      `click(${cx},${cy}) drag(${dx},${dy}) should be WYSIWYG`
    );
  }
});

test('WYSIWYG: matches at viewport scale 0.5 and 2.0', () => {
  const rect = { left: 100, top: 100, width: 80, height: 40 };
  assert.ok(wysiwygOk(rect, 30, 15, 100, 100, 0.5));
  assert.ok(wysiwygOk(rect, 30, 15, 100, 100, 2.0));
});

// ---------- applyLayoutOffset (the second drag bug) ----------
//
// Symptom: every drag of a left-side child moved it further from the root,
// even when the user dragged it back toward the center. Root cause: the
// renderer's position() multiplied offset.x by `dir` (-1 for left-side
// children), so a positive offset.x stored from a rightward screen drag
// rendered as a LEFTWARD position — the opposite of what the user just did.

const { applyLayoutOffset } = require('../../lib/drag.js');

test('applyLayoutOffset: right-side node moves right when offset.x > 0', () => {
  // Right-side: layoutX = e.g. 200 (right of root). Drag +50 right.
  const r = applyLayoutOffset(200, 100, { x: 50, y: 0 }, +1, false);
  assert.equal(r.x, 250);
  assert.equal(r.y, 100);
});

test('applyLayoutOffset: LEFT-side node also moves right when offset.x > 0', () => {
  // The headline regression. Pre-fix this returned 50 (further left).
  const r = applyLayoutOffset(100, 100, { x: 50, y: 0 }, -1, false);
  assert.equal(r.x, 150, 'left-side node with positive offset.x should render to the right of its layout position');
});

test('applyLayoutOffset: y always moves the same direction (no flip on y)', () => {
  // Vertical drag was never affected by the bug, but lock that down too.
  const right = applyLayoutOffset(0, 0, { x: 0, y: 30 }, +1, false);
  const left  = applyLayoutOffset(0, 0, { x: 0, y: 30 }, -1, false);
  assert.equal(right.y, 30);
  assert.equal(left.y, 30);
});

test('applyLayoutOffset: no offset = no change', () => {
  assert.deepEqual(applyLayoutOffset(123, 45, null, +1, false), { x: 123, y: 45 });
  assert.deepEqual(applyLayoutOffset(123, 45, { x: 0, y: 0 }, -1, false), { x: 123, y: 45 });
});

test('regression: WITH the legacy flip, a left-side node drifted LEFT when user dragged RIGHT', () => {
  // Documents what the broken behaviour produced — left-side node, screen
  // drag of +50 px right, stored offset.x = +50, but layout flipped it.
  const buggy = applyLayoutOffset(100, 100, { x: 50, y: 0 }, -1, true);
  assert.equal(buggy.x, 50, 'old (broken) behaviour: rendered 50px LEFT of layout position');

  const fixed = applyLayoutOffset(100, 100, { x: 50, y: 0 }, -1, false);
  assert.equal(fixed.x, 150, 'new (fixed) behaviour: rendered 50px RIGHT of layout position');

  assert.notEqual(buggy.x, fixed.x);
});

test('regression: cumulative drift — repeated rightward drags on left-side node should NOT walk it leftward', () => {
  // Simulate the user scenario: drag +50 right, then +50 right again.
  // Each drag adds 50 to offset.x. After two drags, offset.x = 100.
  // With the legacy flip, that rendered 100 px LEFT of layout (further away).
  const layoutX = 200;
  let offset = { x: 0, y: 0 };

  for (let i = 0; i < 3; i++) {
    offset = { x: offset.x + 50, y: offset.y };
  }
  // Stored offset.x is now 150.

  const buggy = applyLayoutOffset(layoutX, 0, offset, -1, true);
  // Buggy: x = 200 + 150 * -1 = 50 → walked 150 px left of where it started.
  assert.equal(buggy.x, 50);

  const fixed = applyLayoutOffset(layoutX, 0, offset, -1, false);
  // Fixed: x = 200 + 150 = 350 → walked 150 px right of where it started, as the user intended.
  assert.equal(fixed.x, 350);
});

test('regression: a click at (50, 25) inside an 80x40 node would drift ~36 px under the old (14,14) grip', () => {
  // This test documents WHY the bug was painful. The old code computed the
  // ghost as (cursor - 14, cursor - 14) regardless of click point. With a
  // click 50 px from the left edge, the ghost was visually 36 px to the LEFT
  // of where the real node ultimately landed.
  const rect = { left: 100, top: 100, width: 80, height: 40 };
  const clickX = rect.left + 50;
  const clickY = rect.top + 25;
  const lastX = clickX + 200;
  const lastY = clickY + 100;

  const oldGhostFinalX = lastX - 14;
  const oldGhostFinalY = lastY - 14;

  const realFinalX = predictRealNodeFinalPosition(clickX, clickY, lastX, lastY, rect, 1, { x: 0, y: 0 }).x;
  const realFinalY = predictRealNodeFinalPosition(clickX, clickY, lastX, lastY, rect, 1, { x: 0, y: 0 }).y;

  // Under the OLD constant grip: ghost would have been off by (clickOffset - 14)
  assert.equal(oldGhostFinalX - realFinalX, 50 - 14);
  assert.equal(oldGhostFinalY - realFinalY, 25 - 14);

  // Under the NEW computed grip: ghost matches reality.
  const newGhost = predictGhostFinalPosition(clickX, clickY, lastX, lastY, rect);
  assert.equal(newGhost.x, realFinalX);
  assert.equal(newGhost.y, realFinalY);
});
