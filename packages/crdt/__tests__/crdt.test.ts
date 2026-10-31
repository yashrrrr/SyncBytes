import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import {
  initHybridDoc,
  encodeDocSnapshot,
  applyDocUpdate,
  mergeDocUpdates,
  type CanvasShape,
} from '../src/index.js';

describe('CRDT Convergence and State Synchronization', () => {
  it('should converge concurrent text edits between two clients', () => {
    // Client A and Client B start from empty state
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const hybridA = initHybridDoc(docA);
    const hybridB = initHybridDoc(docB);

    // Initial sync
    const initialUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initialUpdate);

    // Client A appends text
    const textA = docA.getText('content');
    textA.insert(0, 'Hello from Client A! ');

    // Client B simultaneously appends text
    const textB = docB.getText('content');
    textB.insert(0, 'Greetings from Client B! ');

    // Exchange updates
    const updateFromA = Y.encodeStateAsUpdate(docA);
    const updateFromB = Y.encodeStateAsUpdate(docB);

    Y.applyUpdate(docB, updateFromA);
    Y.applyUpdate(docA, updateFromB);

    // Both documents must converge to the exact same string
    assert.strictEqual(textA.toString(), textB.toString());
    console.log('Converged text content:', textA.toString());
  });

  it('should synchronize canvas shapes across clients without conflicts', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const hybridA = initHybridDoc(docA);
    const hybridB = initHybridDoc(docB);

    // Client A creates a rectangle shape
    const rectShape: CanvasShape = {
      id: 'rect-1',
      type: 'rectangle',
      x: 100,
      y: 150,
      width: 200,
      height: 120,
      strokeColor: '#38bdf8',
      fillColor: '#0369a1',
      strokeWidth: 2,
      opacity: 1,
      zIndex: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    hybridA.shapesMap.set(rectShape.id, rectShape);

    // Sync A -> B
    const updateA = encodeDocSnapshot(docA);
    applyDocUpdate(docB, updateA);

    // Check Client B received the shape
    const shapeOnB = hybridB.shapesMap.get('rect-1');
    assert.ok(shapeOnB);
    assert.strictEqual(shapeOnB.x, 100);
    assert.strictEqual(shapeOnB.strokeColor, '#38bdf8');

    // Client B moves the shape concurrently
    hybridB.shapesMap.set('rect-1', {
      ...shapeOnB,
      x: 250,
      updatedAt: Date.now(),
    });

    // Client A adds a sticky note concurrently
    const stickyShape: CanvasShape = {
      id: 'sticky-1',
      type: 'sticky',
      x: 400,
      y: 400,
      width: 150,
      height: 150,
      strokeColor: '#f59e0b',
      fillColor: '#fef3c7',
      strokeWidth: 2,
      opacity: 1,
      zIndex: 2,
      text: 'Remember to test offline resilience',
      color: '#fef3c7',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    hybridA.shapesMap.set(stickyShape.id, stickyShape);

    // Sync updates both ways
    const updateFromB2 = encodeDocSnapshot(docB);
    const updateFromA2 = encodeDocSnapshot(docA);

    applyDocUpdate(docA, updateFromB2);
    applyDocUpdate(docB, updateFromA2);

    // Both clients have 2 shapes with identical state
    assert.strictEqual(hybridA.shapesMap.size, 2);
    assert.strictEqual(hybridB.shapesMap.size, 2);
    assert.deepStrictEqual(
      hybridA.shapesMap.get('rect-1'),
      hybridB.shapesMap.get('rect-1')
    );
  });

  it('should accurately merge delta logs into a consolidated snapshot', () => {
    const originalDoc = new Y.Doc();
    const hybridOriginal = initHybridDoc(originalDoc);

    const deltaUpdates: Uint8Array[] = [];

    // Record listener for updates
    originalDoc.on('update', (update: Uint8Array) => {
      deltaUpdates.push(update);
    });

    // Make 10 sequential edits
    for (let i = 0; i < 10; i++) {
      hybridOriginal.shapesMap.set(`shape-${i}`, {
        id: `shape-${i}`,
        type: 'rectangle',
        x: i * 20,
        y: i * 20,
        width: 100,
        height: 100,
        strokeColor: '#fff',
        fillColor: '#000',
        strokeWidth: 1,
        opacity: 1,
        zIndex: i,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    assert.strictEqual(deltaUpdates.length, 10);

    // Merge all 10 deltas into 1 compact binary update
    const mergedSnapshot = mergeDocUpdates(deltaUpdates);

    // Replay snapshot onto a brand new empty doc
    const restoredDoc = new Y.Doc();
    const hybridRestored = initHybridDoc(restoredDoc);
    applyDocUpdate(restoredDoc, mergedSnapshot);

    // Verify restored doc has all 10 shapes matching original
    assert.strictEqual(hybridRestored.shapesMap.size, 10);
    for (let i = 0; i < 10; i++) {
      assert.deepStrictEqual(
        hybridRestored.shapesMap.get(`shape-${i}`),
        hybridOriginal.shapesMap.get(`shape-${i}`)
      );
    }
  });
});
