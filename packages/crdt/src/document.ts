import * as Y from 'yjs';
import { CRDT_FIELDS } from './constants.js';
import type { CanvasShape, DocumentMetadata } from './types.js';

export interface HybridDocStructure {
  doc: Y.Doc;
  metadataMap: Y.Map<any>;
  textFragment: Y.XmlFragment;
  shapesMap: Y.Map<CanvasShape>;
}

/**
 * Initializes and binds the standard hybrid data structure to a Y.Doc
 */
export function initHybridDoc(doc: Y.Doc = new Y.Doc()): HybridDocStructure {
  const metadataMap = doc.getMap(CRDT_FIELDS.METADATA);
  const textFragment = doc.getXmlFragment(CRDT_FIELDS.PROSEMIRROR);
  const shapesMap = doc.getMap<CanvasShape>(CRDT_FIELDS.SHAPES);

  return {
    doc,
    metadataMap,
    textFragment,
    shapesMap,
  };
}

/**
 * Encodes the entire Y.Doc state to a Uint8Array snapshot
 */
export function encodeDocSnapshot(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Applies a snapshot or delta update to a target Y.Doc
 */
export function applyDocUpdate(doc: Y.Doc, update: Uint8Array, origin?: any): void {
  Y.applyUpdate(doc, update, origin);
}

/**
 * Merges multiple binary delta updates into a single compact update Uint8Array
 */
export function mergeDocUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}
