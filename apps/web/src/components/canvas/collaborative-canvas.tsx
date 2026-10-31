'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { CanvasShape, UserPresence, ShapeType, DrawShape } from '@syncbytes/crdt';
import {
  MousePointer,
  Square,
  Circle,
  StickyNote,
  ArrowUpRight,
  Pencil,
  ZoomIn,
  ZoomOut,
  Trash2,
  RotateCcw,
} from 'lucide-react';

interface CollaborativeCanvasProps {
  shapesMap: Y.Map<CanvasShape>;
  provider: WebsocketProvider | null;
  localUser: UserPresence;
  onlineUsers: UserPresence[];
}

const PALETTE = [
  { name: 'Sky', stroke: '#38bdf8', fill: '#0369a1' },
  { name: 'Emerald', stroke: '#34d399', fill: '#065f46' },
  { name: 'Amber', stroke: '#fbbf24', fill: '#78350f' },
  { name: 'Indigo', stroke: '#818cf8', fill: '#3730a3' },
  { name: 'Rose', stroke: '#fb7185', fill: '#881337' },
  { name: 'White', stroke: '#f8fafc', fill: '#334155' },
];

export const CollaborativeCanvas: React.FC<CollaborativeCanvasProps> = ({
  shapesMap,
  provider,
  localUser,
  onlineUsers,
}) => {
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [selectedTool, setSelectedTool] = useState<ShapeType | 'select'>('select');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(PALETTE[0]!);

  // Pan and Zoom viewport state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Active freehand draw state
  const activeDrawIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize state from Y.Map into local state
  useEffect(() => {
    const updateLocalShapes = () => {
      const allShapes: CanvasShape[] = [];
      shapesMap.forEach((shape) => {
        allShapes.push(shape);
      });
      allShapes.sort((a, b) => a.zIndex - b.zIndex);
      setShapes(allShapes);
    };

    updateLocalShapes();
    shapesMap.observe(updateLocalShapes);

    return () => {
      shapesMap.unobserve(updateLocalShapes);
    };
  }, [shapesMap]);

  // Convert screen coordinates to canvas world coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = screenX - rect.left;
      const relativeY = screenY - rect.top;

      return {
        x: (relativeX - pan.x) / zoom,
        y: (relativeY - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Mouse move handler for live cursor presence, dragging, and freehand drawing
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const worldPos = screenToWorld(e.clientX, e.clientY);

      // 1. Broadcast cursor position to peers via Yjs awareness
      if (provider) {
        provider.awareness.setLocalStateField('user', {
          ...localUser,
          cursor: {
            x: worldPos.x,
            y: worldPos.y,
            view: 'canvas',
          },
          lastActive: Date.now(),
        });
      }

      // 2. Handle active freehand drawing
      if (activeDrawIdRef.current) {
        const activeShape = shapesMap.get(activeDrawIdRef.current) as DrawShape | undefined;
        if (activeShape && activeShape.type === 'draw') {
          const relX = worldPos.x - activeShape.x;
          const relY = worldPos.y - activeShape.y;
          shapesMap.set(activeDrawIdRef.current, {
            ...activeShape,
            points: [...activeShape.points, [relX, relY]],
            updatedAt: Date.now(),
          });
        }
        return;
      }

      // 3. Handle canvas panning
      if (isPanning && dragStart) {
        setPan({
          x: pan.x + (e.clientX - dragStart.x),
          y: pan.y + (e.clientY - dragStart.y),
        });
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      // 4. Handle shape dragging
      if (selectedShapeId && dragStart && selectedTool === 'select') {
        const dx = (e.clientX - dragStart.x) / zoom;
        const dy = (e.clientY - dragStart.y) / zoom;

        const currentShape = shapesMap.get(selectedShapeId);
        if (currentShape) {
          shapesMap.set(selectedShapeId, {
            ...currentShape,
            x: currentShape.x + dx,
            y: currentShape.y + dy,
            updatedAt: Date.now(),
          });
          setDragStart({ x: e.clientX, y: e.clientY });
        }
      }
    },
    [screenToWorld, provider, localUser, isPanning, dragStart, pan, selectedShapeId, selectedTool, shapesMap, zoom]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle-click or Shift-click starts panning
    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return;

    const world = screenToWorld(e.clientX, e.clientY);

    // Freehand Pen Tool
    if (selectedTool === 'draw') {
      const shapeId = `draw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = Date.now();
      const drawShape: DrawShape = {
        id: shapeId,
        type: 'draw',
        x: world.x,
        y: world.y,
        width: 0,
        height: 0,
        strokeColor: selectedColor.stroke,
        fillColor: 'transparent',
        strokeWidth: 3,
        opacity: 1,
        zIndex: shapes.length + 1,
        points: [[0, 0]],
        createdAt: now,
        updatedAt: now,
      };

      activeDrawIdRef.current = shapeId;
      shapesMap.set(shapeId, drawShape);
      return;
    }

    // Discrete Shapes
    if (selectedTool !== 'select') {
      const shapeId = `shape-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = Date.now();

      let newShape: CanvasShape;

      switch (selectedTool) {
        case 'sticky':
          newShape = {
            id: shapeId,
            type: 'sticky',
            x: world.x - 75,
            y: world.y - 60,
            width: 150,
            height: 120,
            strokeColor: '#f59e0b',
            fillColor: '#fef3c7',
            strokeWidth: 2,
            opacity: 1,
            zIndex: shapes.length + 1,
            text: 'Double click to edit note...',
            color: '#fef3c7',
            createdAt: now,
            updatedAt: now,
          };
          break;
        case 'ellipse':
          newShape = {
            id: shapeId,
            type: 'ellipse',
            x: world.x - 60,
            y: world.y - 40,
            width: 120,
            height: 80,
            strokeColor: selectedColor.stroke,
            fillColor: selectedColor.fill,
            strokeWidth: 2,
            opacity: 0.9,
            zIndex: shapes.length + 1,
            createdAt: now,
            updatedAt: now,
          };
          break;
        case 'arrow':
          newShape = {
            id: shapeId,
            type: 'arrow',
            x: world.x,
            y: world.y,
            width: 140,
            height: 60,
            strokeColor: selectedColor.stroke,
            fillColor: selectedColor.stroke,
            strokeWidth: 3,
            opacity: 1,
            zIndex: shapes.length + 1,
            points: [
              [0, 0],
              [140, 60],
            ],
            createdAt: now,
            updatedAt: now,
          };
          break;
        case 'rectangle':
        default:
          newShape = {
            id: shapeId,
            type: 'rectangle',
            x: world.x - 70,
            y: world.y - 50,
            width: 140,
            height: 100,
            strokeColor: selectedColor.stroke,
            fillColor: selectedColor.fill,
            strokeWidth: 2,
            opacity: 0.9,
            zIndex: shapes.length + 1,
            createdAt: now,
            updatedAt: now,
          };
          break;
      }

      shapesMap.set(shapeId, newShape);
      setSelectedShapeId(shapeId);
      setSelectedTool('select');
      return;
    }

    // Otherwise deselect if clicked background
    setSelectedShapeId(null);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDragStart(null);
    activeDrawIdRef.current = null;
  };

  const handleDeleteSelected = () => {
    if (selectedShapeId) {
      shapesMap.delete(selectedShapeId);
      setSelectedShapeId(null);
    }
  };

  const handleClearAll = () => {
    shapesMap.clear();
    setSelectedShapeId(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full bg-slate-950 overflow-hidden select-none cursor-crosshair rounded-xl border border-slate-800"
    >
      {/* Floating Canvas Toolbar */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl shadow-2xl">
        <button
          onClick={() => setSelectedTool('select')}
          className={`p-2 rounded-lg transition-colors ${
            selectedTool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="Select & Move (V)"
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          onClick={() => setSelectedTool('draw')}
          className={`p-2 rounded-lg transition-colors ${
            selectedTool === 'draw' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="Freehand Pencil (P)"
        >
          <Pencil className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <button
          onClick={() => setSelectedTool('rectangle')}
          className={`p-2 rounded-lg transition-colors ${
            selectedTool === 'rectangle' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="Rectangle (R)"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool('ellipse')}
          className={`p-2 rounded-lg transition-colors ${
            selectedTool === 'ellipse' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="Ellipse (O)"
        >
          <Circle className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool('sticky')}
          className={`p-2 rounded-lg transition-colors ${
            selectedTool === 'sticky' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="Sticky Note (S)"
        >
          <StickyNote className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool('arrow')}
          className={`p-2 rounded-lg transition-colors ${
            selectedTool === 'arrow' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="Arrow (A)"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        {/* Color Palette Swatches */}
        <div className="flex items-center gap-1 px-1">
          {PALETTE.map((c) => (
            <button
              key={c.name}
              onClick={() => setSelectedColor(c)}
              className={`w-4 h-4 rounded-full transition-all ${
                selectedColor.name === c.name ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.stroke }}
              title={c.name}
            />
          ))}
        </div>

        {selectedShapeId && (
          <>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button
              onClick={handleDeleteSelected}
              className="p-2 rounded-lg text-rose-400 hover:bg-rose-950/50 transition-colors"
              title="Delete Selected Shape"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}

        {shapes.length > 0 && (
          <button
            onClick={handleClearAll}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Clear Canvas"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1 p-1 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-lg shadow-xl text-xs text-slate-300">
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
          className="p-1.5 hover:bg-slate-800 rounded"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="px-2 font-mono">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          className="p-1.5 hover:bg-slate-800 rounded"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Infinite Canvas Transform Plane */}
      <div
        className="w-full h-full origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* Render Canvas Shapes */}
        <svg className="absolute inset-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" />
            </marker>
          </defs>

          {shapes.map((shape) => {
            const isSelected = selectedShapeId === shape.id;

            if (shape.type === 'draw' && 'points' in shape) {
              const pointsStr = shape.points
                .map(([dx, dy]) => `${shape.x + dx},${shape.y + dy}`)
                .join(' ');

              return (
                <polyline
                  key={shape.id}
                  points={pointsStr}
                  fill="none"
                  stroke={isSelected ? '#38bdf8' : shape.strokeColor}
                  strokeWidth={isSelected ? 5 : shape.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={shape.opacity}
                  className="pointer-events-auto cursor-pointer"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedShapeId(shape.id);
                    setDragStart({ x: e.clientX, y: e.clientY });
                  }}
                />
              );
            }

            if (shape.type === 'rectangle') {
              return (
                <rect
                  key={shape.id}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  rx={8}
                  fill={shape.fillColor}
                  stroke={isSelected ? '#38bdf8' : shape.strokeColor}
                  strokeWidth={isSelected ? 3 : shape.strokeWidth}
                  opacity={shape.opacity}
                  className="pointer-events-auto cursor-pointer transition-shadow"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedShapeId(shape.id);
                    setDragStart({ x: e.clientX, y: e.clientY });
                  }}
                />
              );
            }

            if (shape.type === 'ellipse') {
              return (
                <ellipse
                  key={shape.id}
                  cx={shape.x + shape.width / 2}
                  cy={shape.y + shape.height / 2}
                  rx={shape.width / 2}
                  ry={shape.height / 2}
                  fill={shape.fillColor}
                  stroke={isSelected ? '#38bdf8' : shape.strokeColor}
                  strokeWidth={isSelected ? 3 : shape.strokeWidth}
                  opacity={shape.opacity}
                  className="pointer-events-auto cursor-pointer"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedShapeId(shape.id);
                    setDragStart({ x: e.clientX, y: e.clientY });
                  }}
                />
              );
            }

            if (shape.type === 'arrow' && 'points' in shape) {
              return (
                <line
                  key={shape.id}
                  x1={shape.x}
                  y1={shape.y}
                  x2={shape.x + shape.width}
                  y2={shape.y + shape.height}
                  stroke={isSelected ? '#38bdf8' : shape.strokeColor}
                  strokeWidth={isSelected ? 4 : shape.strokeWidth}
                  markerEnd="url(#arrowhead)"
                  className="pointer-events-auto cursor-pointer"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedShapeId(shape.id);
                    setDragStart({ x: e.clientX, y: e.clientY });
                  }}
                />
              );
            }

            return null;
          })}
        </svg>

        {/* Render HTML Sticky Notes on Canvas */}
        {shapes
          .filter((s): s is Extract<CanvasShape, { type: 'sticky' }> => s.type === 'sticky')
          .map((note) => {
            const isSelected = selectedShapeId === note.id;

            return (
              <div
                key={note.id}
                style={{
                  transform: `translate(${note.x}px, ${note.y}px)`,
                  width: `${note.width}px`,
                  height: `${note.height}px`,
                }}
                className={`absolute p-3 rounded-lg shadow-lg font-sans text-slate-800 text-sm select-none cursor-grab active:cursor-grabbing border ${
                  isSelected ? 'border-sky-500 ring-2 ring-sky-400' : 'border-amber-300'
                }`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedShapeId(note.id);
                  setDragStart({ x: e.clientX, y: e.clientY });
                }}
              >
                <div className="w-full h-full bg-amber-100 p-2 rounded flex flex-col justify-between">
                  <textarea
                    defaultValue={note.text}
                    className="w-full h-full bg-transparent resize-none border-none outline-none text-slate-900 font-medium"
                    onChange={(e) => {
                      shapesMap.set(note.id, {
                        ...note,
                        text: e.target.value,
                        updatedAt: Date.now(),
                      });
                    }}
                  />
                </div>
              </div>
            );
          })}

        {/* Real-time Presence Cursors of Online Collaborators */}
        {onlineUsers
          .filter((u) => u.cursor && u.cursor.view === 'canvas')
          .map((user) => (
            <div
              key={user.id}
              className="absolute pointer-events-none transition-transform duration-75 ease-out z-50 flex items-center gap-1"
              style={{
                transform: `translate(${user.cursor!.x}px, ${user.cursor!.y}px)`,
              }}
            >
              <svg
                className="w-5 h-5 -rotate-45"
                viewBox="0 0 24 24"
                fill={user.color}
                stroke="white"
                strokeWidth="1.5"
              >
                <path d="M3 3l7 18 3-7 7-3L3 3z" />
              </svg>
              <span
                className="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow"
                style={{ backgroundColor: user.color }}
              >
                {user.name}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};
