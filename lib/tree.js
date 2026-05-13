// Pure tree-walking helpers shared by the renderer (window.AgenticTree) and
// the MCP server (require). Before this module the renderer's index.html and
// the MCP server each had their own copy of findNode / countNodes — drift
// bait. The contract is locked in test/unit/tree.test.js.
//
// Node shape (only the fields these helpers touch):
//   { id: string, text: string, children?: Node[] }
// The helpers tolerate missing `children` arrays so renderer and MCP both can
// hand in trees serialized through different paths.
//
// IIFE — keeps the helper names out of the global scope when loaded via plain
// <script> in the renderer (otherwise `function findNodeWithParent` etc. would
// collide with same-named wrappers inside index.html's inline script).

(function () {
  function findNodeWithParent(root, id, parent = null) {
    if (!root) return null;
    if (root.id === id) return { node: root, parent };
    for (const c of root.children || []) {
      const hit = findNodeWithParent(c, id, root);
      if (hit) return hit;
    }
    return null;
  }

  function findNode(root, id) {
    const r = findNodeWithParent(root, id);
    return r ? r.node : null;
  }

  function countNodes(node) {
    if (!node) return 0;
    let n = 1;
    for (const c of node.children || []) n += countNodes(c);
    return n;
  }

  function pathToNode(root, id) {
    const path = [];
    function walk(node) {
      if (!node) return false;
      path.push(node.text);
      if (node.id === id) return true;
      for (const c of node.children || []) {
        if (walk(c)) return true;
      }
      path.pop();
      return false;
    }
    walk(root);
    return path;
  }

  const api = {
    findNode,
    findNodeWithParent,
    countNodes,
    pathToNode,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.AgenticTree = api;
  }
})();
