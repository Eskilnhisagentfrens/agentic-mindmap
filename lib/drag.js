// Pure helpers for the renderer's drag-and-drop math. Lives in /lib so it can
// be unit-tested without a DOM. Exposed both as a CommonJS module (for tests)
// and as window.AgenticDrag globals (for the renderer's <script> include).

// `computeGhostGripOffset` — given the pointerdown coordinates and the dragged
// node's bounding rect, return how far the cursor sits INSIDE the node from
// its top-left corner. The renderer subtracts this offset when positioning the
// ghost element so the cursor "grips" the ghost at the exact same point it
// gripped the original node — making drag truly WYSIWYG.
//
// Old behaviour used a hard-coded (14, 14) grip, which only matched when the
// user clicked at exactly (rect.left + 14, rect.top + 14). For any other click
// point the ghost visually drifted away from the cursor and, more critically,
// the released node ended up offset from where the ghost appeared at release.
function computeGhostGripOffset(clickX, clickY, rect) {
  if (!rect || typeof rect.left !== 'number' || typeof rect.top !== 'number') {
    // Defensive default — same as the old constant. Caller should always
    // pass a real rect, but this avoids NaN if the source element vanishes.
    return { x: 14, y: 14 };
  }
  return {
    x: clickX - rect.left,
    y: clickY - rect.top,
  };
}

// `computeFreePositionDelta` — given pointerdown / pointerup screen coords and
// the canvas viewport scale, return how much the dragged node's `offset`
// field should change. Pure inverse of the ghost grip: combined, they ensure
// ghost-final-position === real-node-final-position.
//
// Returns null when the drag distance is below the no-op threshold (the user
// pressed and released essentially in place; treated as a click, not a drag).
function computeFreePositionDelta(startX, startY, lastX, lastY, scale, threshold = 4) {
  const dxScreen = (lastX == null ? startX : lastX) - startX;
  const dyScreen = (lastY == null ? startY : lastY) - startY;
  if (Math.hypot(dxScreen, dyScreen) < threshold) return null;
  const s = (typeof scale === 'number' && scale > 0) ? scale : 1;
  return { x: dxScreen / s, y: dyScreen / s };
}

// `predictGhostFinalPosition` and `predictRealNodeFinalPosition` are the two
// halves of the WYSIWYG invariant. Used by tests to assert they match.
function predictGhostFinalPosition(startX, startY, lastX, lastY, srcRect) {
  const grip = computeGhostGripOffset(startX, startY, srcRect);
  return { x: lastX - grip.x, y: lastY - grip.y };
}

function predictRealNodeFinalPosition(startX, startY, lastX, lastY, srcRect, scale, oldNodeOffset) {
  // The renderer composes the on-screen position roughly as
  //   screen_TL = (layout_pos + node.offset) * scale + canvas_pan
  // For free-positioning we mutate `node.offset` by `delta`. In screen pixels:
  //   new_screen_TL = old_screen_TL + delta * scale = old_screen_TL + (last - start)
  // (the `scale` divisions inside computeFreePositionDelta cancel.)
  // So the predicted final TL is just rect.left/top + screen-pixel drag delta.
  const delta = computeFreePositionDelta(startX, startY, lastX, lastY, scale);
  if (!delta) {
    return { x: srcRect.left, y: srcRect.top };
  }
  return {
    x: srcRect.left + delta.x * (typeof scale === 'number' && scale > 0 ? scale : 1),
    y: srcRect.top + delta.y * (typeof scale === 'number' && scale > 0 ? scale : 1),
  };
}

// Models the renderer's layout step — given the layout-prescribed position of
// a node and its stored offset, return the final on-screen position.
//
// The fix here: BOTH sides of the radial layout (right side dir=+1 / left
// side dir=-1) must apply offset.x in the SAME direction (rightward = +x on
// screen). The previous implementation multiplied offset.x by dir, which made
// a rightward drag on a left-side node visibly move it LEFT (further from
// the root) — the "every drag drifts further from root" bug v0.4.0 shipped.
//
// `flipForLeftSide` is the legacy switch the regression test toggles to
// document what the broken behaviour produced. The renderer should always
// pass `false`.
function applyLayoutOffset(layoutX, layoutY, nodeOffset, dir, flipForLeftSide = false) {
  const ox = (nodeOffset && nodeOffset.x) || 0;
  const oy = (nodeOffset && nodeOffset.y) || 0;
  const xContribution = flipForLeftSide ? ox * dir : ox;
  return { x: layoutX + xContribution, y: layoutY + oy };
}

const exportsObj = {
  computeGhostGripOffset,
  computeFreePositionDelta,
  predictGhostFinalPosition,
  predictRealNodeFinalPosition,
  applyLayoutOffset,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
}
if (typeof window !== 'undefined') {
  window.AgenticDrag = exportsObj;
}
