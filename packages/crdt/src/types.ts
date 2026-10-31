export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text' | 'sticky' | 'draw';

export interface BaseShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface StickyShape extends BaseShape {
  type: 'sticky';
  text: string;
  color: string;
}

export interface TextShape extends BaseShape {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
}

export interface LineShape extends BaseShape {
  type: 'line' | 'arrow';
  points: [number, number][]; // Relative points [dx, dy]
}

export interface DrawShape extends BaseShape {
  type: 'draw';
  points: [number, number][]; // Relative points [dx, dy]
}

export interface GeoShape extends BaseShape {
  type: 'rectangle' | 'ellipse' | 'diamond';
}

export type CanvasShape = StickyShape | TextShape | LineShape | DrawShape | GeoShape;

export interface UserPresence {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  cursor?: {
    x: number;
    y: number;
    view: 'doc' | 'canvas';
  } | null;
  selectedShapeIds?: string[];
  lastActive: number;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  ownerId?: string;
}
