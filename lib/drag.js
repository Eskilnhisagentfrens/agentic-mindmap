// Pure helpers for the renderer's drag-and-drop math. Lives in /lib so it can
// be unit-tested without a DOM. Exposed both as a CommonJS module (for tests)
// and as window.AgenticDrag (for the renderer's <script> include).
//
// IIFE — keeps internal helper names out of the global scope when loaded via
// plain <script>. Without this wrapper, the top-level `function` and `const`
// declarations would leak into `window` and collide with the inline script.

(function () {
  // `computeGhostGripOffset` — given pointerdown coords + the dragged node's
  // bounding rect, return how far the cursor sits INSIDE the node from its
  // top-left corner. The renderer subtracts this offset when positioning the
  // ghost so the cursor "grips" the ghost at the same point it gripped the
  // original node — making drag truly WYSIWYG.
  //
  // Old behaviour used a hard-coded (14, 14) grip, which only matched when
  // the user clicked at exactly (rect.left + 14, rect.top + 14).
  function computeGhostGripOffset(clickX, clickY, rect) {
    if (!rect || typeof rect.left !== 'number' || typeof rect.top !== 'number') {
      return { x: 14, y: 14 };
    }
    return {
      x: clickX - rect.left,
      y: clickY - rect.top,
    };
  }

  // `computeFreePositionDelta` — pointerdown / pointerup screen coords + the
  // viewport scale → how much the dragged node's `offset` field should change.
  // Pure inverse of the ghost grip: combined they make
  // ghost-final-position === real-node-final-position. Returns null when the
  // drag distance is below the no-op threshold (treated as a click, not drag).
  function computeFreePositionDelta(startX, startY, lastX, lastY, scale, threshold = 4) {
    const dxScreen = (lastX == null ? startX : lastX) - startX;
    const dyScreen = (lastY == null ? startY : lastY) - startY;
    if (Math.hypot(dxScreen, dyScreen) < threshold) return null;
    const s = (typeof scale === 'number' && scale > 0) ? scale : 1;
    return { x: dxScreen / s, y: dyScreen / s };
  }

  // The two halves of the WYSIWYG invariant. Used by the unit tests to assert
  // they match for any click point inside the node and any drag delta.
  function predictGhostFinalPosition(startX, startY, lastX, lastY, srcRect) {
    const grip = computeGhostGripOffset(startX, startY, srcRect);
    return { x: lastX - grip.x, y: lastY - grip.y };
  }

  function predictRealNodeFinalPosition(startX, startY, lastX, lastY, srcRect, scale, oldNodeOffset) {
    // The renderer composes the on-screen position roughly as
    //   screen_TL = (layout_pos + node.offset) * scale + canvas_pan
    // For free-positioning we mutate `node.offset` by `delta`. In screen px:
    //   new_screen_TL = old_screen_TL + delta * scale
    //                 = old_screen_TL + (last - start)
    // (the `scale` division inside computeFreePositionDelta cancels.)
    const delta = computeFreePositionDelta(startX, startY, lastX, lastY, scale);
    if (!delta) {
      return { x: srcRect.left, y: srcRect.top };
    }
    return {
      x: srcRect.left + delta.x * (typeof scale === 'number' && scale > 0 ? scale : 1),
      y: srcRect.top + delta.y * (typeof scale === 'number' && scale > 0 ? scale : 1),
    };
  }

  // Models the renderer's layout step — given the layout-prescribed position
  // of a node and its stored offset, return the final on-screen position.
  //
  // The fix here: BOTH sides of the radial layout (right side dir=+1 / left
  // side dir=-1) apply offset.x in the SAME direction (rightward = +x on
  // screen). The previous implementation multiplied offset.x by dir, making
  // a rightward drag on a left-side node visibly move it LEFT — the "every
  // drag drifts further from root" bug v0.4.0 shipped with.
  //
  // `flipForLeftSide` is the legacy switch the regression test toggles to
  // document what the broken behaviour produced. The renderer always passes
  // `false`.
  function applyLayoutOffset(layoutX, layoutY, nodeOffset, dir, flipForLeftSide = false) {
    const ox = (nodeOffset && nodeOffset.x) || 0;
    const oy = (nodeOffset && nodeOffset.y) || 0;
    const xContribution = flipForLeftSide ? ox * dir : ox;
    return { x: layoutX + xContribution, y: layoutY + oy };
  }

  const api = {
    computeGhostGripOffset,
    computeFreePositionDelta,
    predictGhostFinalPosition,
    predictRealNodeFinalPosition,
    applyLayoutOffset,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.AgenticDrag = api;
  }
})();
