// Unit tests for lib/tree.js — pure tree-walking helpers shared between the
// renderer (window.AgenticTree) and the MCP server (via require). Before this
// module there were three copies of these walks across index.html and
// mcp/lib.js — drift bait. The contract is now locked in here.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findNode,
  findNodeWithParent,
  countNodes,
  pathToNode,
} = require('../../lib/tree.js');

function fixtureTree() {
  return {
    id: 'root',
    text: 'Root',
    children: [
      {
        id: 'a',
        text: 'Branch A',
        children: [
          { id: 'a1', text: 'A leaf' },
          { id: 'a2', text: 'Another A leaf' },
        ],
      },
      { id: 'b', text: 'Branch B', children: [] },
      { id: 'c', text: 'Branch C' /* no children key */ },
    ],
  };
}

// ---------- findNodeWithParent ----------

test('findNodeWithParent returns {node, parent} for root with parent=null', () => {
  const t = fixtureTree();
  const r = findNodeWithParent(t, 'root');
  assert.ok(r);
  assert.equal(r.node.id, 'root');
  assert.equal(r.parent, null);
});

test('findNodeWithParent returns {node, parent} for a leaf', () => {
  const t = fixtureTree();
  const r = findNodeWithParent(t, 'a2');
  assert.ok(r);
  assert.equal(r.node.text, 'Another A leaf');
  assert.equal(r.parent.id, 'a');
});

test('findNodeWithParent returns null for unknown id', () => {
  const t = fixtureTree();
  assert.equal(findNodeWithParent(t, 'does-not-exist'), null);
});

test('findNodeWithParent tolerates missing children arrays', () => {
  const t = fixtureTree();
  const r = findNodeWithParent(t, 'c');
  assert.ok(r);
  assert.equal(r.node.text, 'Branch C');
});

test('findNodeWithParent handles null root safely', () => {
  assert.equal(findNodeWithParent(null, 'anything'), null);
  assert.equal(findNodeWithParent(undefined, 'anything'), null);
});

// ---------- findNode (thin wrapper that drops the parent) ----------

test('findNode returns just the node, not the {node, parent} pair', () => {
  const t = fixtureTree();
  const n = findNode(t, 'a1');
  assert.equal(n.id, 'a1');
  assert.equal(n.text, 'A leaf');
});

test('findNode returns null for unknown id', () => {
  assert.equal(findNode(fixtureTree(), 'missing'), null);
});

// ---------- countNodes ----------

test('countNodes counts root + every descendant', () => {
  const t = fixtureTree();
  // root + a, a1, a2 + b + c = 6
  assert.equal(countNodes(t), 6);
});

test('countNodes on a leaf is 1', () => {
  assert.equal(countNodes({ id: 'x', text: 'x' }), 1);
});

test('countNodes on null is 0', () => {
  assert.equal(countNodes(null), 0);
  assert.equal(countNodes(undefined), 0);
});

// ---------- pathToNode ----------

test('pathToNode returns array of texts from root to target inclusive', () => {
  const t = fixtureTree();
  assert.deepEqual(pathToNode(t, 'a2'), ['Root', 'Branch A', 'Another A leaf']);
});

test('pathToNode of root is just [root.text]', () => {
  const t = fixtureTree();
  assert.deepEqual(pathToNode(t, 'root'), ['Root']);
});

test('pathToNode of unknown id returns []', () => {
  const t = fixtureTree();
  assert.deepEqual(pathToNode(t, 'unknown'), []);
});

test('pathToNode handles null root gracefully', () => {
  assert.deepEqual(pathToNode(null, 'x'), []);
});
