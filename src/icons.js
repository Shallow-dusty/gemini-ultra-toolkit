// ╔══════════════════════════════════════════════════════════════════════════╗
// ║              SVG Icon Factory (CSP-safe, createElementNS)               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const NS = "http://www.w3.org/2000/svg";

// Lucide-style icon path data (stroke-based, 24x24 viewBox)
const PATHS = {
  menu: ["M4 12h16", "M4 6h16", "M4 18h16"],
  settings: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ],
  chart: ["M18 20V10", "M12 20V4", "M6 20v-6"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  download: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "M7 10l5 5 5-5",
    "M12 15V3",
  ],
  upload: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "M17 8l-5-5-5 5",
    "M12 3v12",
  ],
  trash: [
    "M3 6h18",
    "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
    "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
  ],
  folder: [
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
  ],
  gem: ["M6 3h12l4 6-10 13L2 9z", "M11 3l1 10", "M2 9h20"],
  bot: [
    "M12 8V4H8",
    "M2 14a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
    "M6 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M18 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  ],
  quote: [
    "M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.017-2-2H5c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2z",
    "M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.017-2-2h-3c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2z",
  ],
  palette: [
    "M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10c0 .7-.07 1.38-.2 2.04a2.5 2.5 0 0 1-2.46 2.07c-.26 0-.5-.04-.74-.12A2.49 2.49 0 0 0 17 16a2.5 2.5 0 0 0-2.5 2.5c0 .69.28 1.31.73 1.76A9.93 9.93 0 0 1 12 22z",
  ],
  wrench: [
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  ],
  pin: [
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ],
  bug: [
    "M8 2l1.88 1.88",
    "M14.12 3.88 16 2",
    "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1",
    "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6",
    "M12 20v-9",
    "M6.53 9C4.6 8.8 3 7.1 3 5",
    "M6 13H2",
    "M3 21c0-2.1 1.7-3.9 3.8-4",
    "M20.97 5c0 2.1-1.6 3.8-3.5 4",
    "M22 13h-4",
    "M17.2 17c2.1.1 3.8 1.9 3.8 4",
  ],
  package: [
    "M16.5 9.4 7.55 4.24",
    "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
    "M3.27 6.96 12 12.01l8.73-5.05",
    "M12 22.08V12",
  ],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
  refresh: [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ],
  lock: [
    "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z",
    "M7 11V7a5 5 0 0 1 10 0v4",
  ],
  edit: ["M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"],
  copy: [
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    "M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z",
  ],
  search: [
    "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    "M21 21l-4.35-4.35",
  ],
  globe: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M2 12h20",
    "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  ],
  'file-text': [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M10 9H8",
    "M16 13H8",
    "M16 17H8",
  ],
  compass: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z",
  ],
};

// Color dot paths (filled circles for palette)
const DOTS = {
  palette: [
    { cx: 7.5, cy: 10.5, r: 1.5 },
    { cx: 12, cy: 7.5, r: 1.5 },
    { cx: 16.5, cy: 10.5, r: 1.5 },
  ],
};

/**
 * Create an SVG icon element (CSP-safe, no innerHTML).
 * Uses currentColor for stroke, so inherits text color from parent.
 * @param {string} name - Icon name from PATHS registry
 * @param {number} [size=16] - Icon width/height in pixels
 * @returns {SVGSVGElement} SVG DOM element
 */
export function createIcon(name, size = 16) {
  const paths = PATHS[name];
  if (!paths) return document.createTextNode(name);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "gc-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.25");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("shape-rendering", "geometricPrecision");
  svg.style.verticalAlign = "middle";
  svg.style.flexShrink = "0";

  for (const d of paths) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  // Add filled circles if icon has dots (e.g., palette)
  const dots = DOTS[name];
  if (dots) {
    for (const { cx, cy, r } of dots) {
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", String(r));
      circle.setAttribute("fill", "currentColor");
      circle.setAttribute("stroke", "none");
      svg.appendChild(circle);
    }
  }

  return svg;
}

/** Icon name constants for type-safe reference */
export const ICON_NAMES = {
  menu: "menu",
  settings: "settings",
  chart: "chart",
  x: "x",
  download: "download",
  upload: "upload",
  trash: "trash",
  folder: "folder",
  gem: "gem",
  bot: "bot",
  quote: "quote",
  palette: "palette",
  wrench: "wrench",
  pin: "pin",
  bug: "bug",
  package: "package",
  info: "info",
  refresh: "refresh",
  lock: "lock",
  edit: "edit",
  copy: "copy",
  search: "search",
  globe: "globe",
  'file-text': "file-text",
  compass: "compass",
};
