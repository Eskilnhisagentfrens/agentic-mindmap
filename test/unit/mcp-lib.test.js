// Unit tests for mcp/lib.js — pure tree helpers used by the MCP server.
// Uses node:test (Node 20+, zero deps). Run via `npm test` or
// `node --test test/unit/mcp-lib.test.js`.

const test = require('node:test');
const assert = require('node:assert/strict');

const { findNode, trimTree, countNodes, searchTree } = require('../../mcp/lib.js');

function fixtureTree() {
  return {
    id: 'root',
    text: 'Project Plan',
    icon: '🎯',
    children: [
      {
        id: 'a',
        text: 'Discovery',
        note: 'user research phase',
        children: [
          { id: 'a1', text: 'User interviews' },
          { id: 'a2', text: 'Competitor analysis', note: 'find 3-5 direct rivals' },
        ],
      },
      {
        id: 'b',
        text: 'Build',
        children: [
          { id: 'b1', text: 'API skeleton' },
        ],
      },
      { id: 'c', text: 'Launch checklist' },
    ],
  };
}

test('findNode finds nodes at every depth', () => {
  const t = fixtureTree();
  assert.equal(findNode(t, 'root').text, 'Project Plan');
  assert.equal(findNode(t, 'a2').text, 'Competitor analysis');
  assert.equal(findNode(t, 'b1').text, 'API skeleton');
  assert.equal(findNode(t, 'unknown'), null);
  assert.equal(findNode(null, 'x'), null);
});

test('countNodes counts root + every descendant', () => {
  const t = fixtureTree();
  assert.equal(countNodes(t), 7);   // root + a, a1, a2, b, b1, c
  assert.equal(countNodes({ id: 'x', text: 'x' }), 1);
  assert.equal(countNodes(null), 0);
});

test('trimTree honors maxDepth and includeNotes', () => {
  const t = fixtureTree();
  const shallow = trimTree(t, 1, true);
  assert.equal(shallow.children.length, 3);
  // depth=1 means root + immediate children, no grandchildren rendered
  assert.equal(shallow.children[0].children, undefined);

  const withNotes = trimTree(t, null, true);
  const aNode = withNotes.children.find(c => c.id === 'a');
  assert.equal(aNode.note, 'user research phase');

  const noNotes = trimTree(t, null, false);
  const aNoNotes = noNotes.children.find(c => c.id === 'a');
  assert.equal(aNoNotes.note, undefined);
});

test('trimTree preserves icons but strips empty fields', () => {
  const t = fixtureTree();
  const out = trimTree(t, null, true);
  assert.equal(out.icon, '🎯');
  // a leaf with no icon shouldn't carry an icon key
  const c = out.children.find(n => n.id === 'c');
  assert.equal(c.icon, undefined);
});

test('searchTree matches text and notes case-insensitively', () => {
  const t = fixtureTree();

  const hits = searchTree(t, 'rivals', 10, true);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'a2');
  assert.match(hits[0].snippet, /rivals/);
  // path must include all ancestors plus the node itself
  assert.deepEqual(hits[0].path, ['Project Plan', 'Discovery', 'Competitor analysis']);
});

test('searchTree includeNotes=false skips note matches', () => {
  const t = fixtureTree();
  // "rivals" only appears in a note
  const withNotes    = searchTree(t, 'rivals', 10, true);
  const withoutNotes = searchTree(t, 'rivals', 10, false);
  assert.equal(withNotes.length, 1);
  assert.equal(withoutNotes.length, 0);
});

test('searchTree respects limit', () => {
  const t = fixtureTree();
  // "a" matches many nodes ("Plan", "Analysis", etc.)
  const hits = searchTree(t, 'a', 2, true);
  assert.equal(hits.length, 2);
});

test('searchTree empty query returns nothing', () => {
  const t = fixtureTree();
  assert.deepEqual(searchTree(t, '', 10, true), []);
  assert.deepEqual(searchTree(t, null, 10, true), []);
});
