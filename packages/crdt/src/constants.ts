export const CRDT_FIELDS = {
  METADATA: 'metadata',
  PROSEMIRROR: 'prosemirror',
  SHAPES: 'shapes',
  BINDINGS: 'bindings',
  EXCALIDRAW_ELEMENTS: 'excalidraw_elements',
  EXCALIDRAW_FILES: 'excalidraw_files',
} as const;

export const DEFAULT_PRESENCE_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export const getRandomColor = (): string => {
  const index = Math.floor(Math.random() * DEFAULT_PRESENCE_COLORS.length);
  return DEFAULT_PRESENCE_COLORS[index]!;
};
