interface Point { x: number; y: number }
interface Size { width: number; height: number }
export interface GraphCalloutObstacle extends Point { radius: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** One diagonal segment, then a horizontal segment into a side's midpoint. */
function connectCard(anchor: Point, radius: number, x: number, y: number, width: number, height: number, side: number) {
  const end = { x: side < 0 ? x : x + width, y: y + height / 2 };
  const outside = side * (anchor.x - end.x);
  const verticalGap = Math.max(y - anchor.y, anchor.y - y - height, 1);
  // When the node is above/below the card, clear its corner before approaching the side.
  const cornerClearance = outside < 0 ? -outside * height / (2 * verticalGap) + 12 : 0;
  const lead = Math.max(24, cornerClearance, Math.min(40, outside * 0.45));
  const bend = { x: end.x + side * lead, y: end.y };
  const dx = bend.x - anchor.x, dy = bend.y - anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  const start = { x: anchor.x + dx / length * radius, y: anchor.y + dy / length * radius };
  return [start, bend, end];
}

/** Prefer nearby empty space, keeping both the card and its leader clear of nodes. */
export function placeGraphCallout(anchor: Point, radius: number, card: Size, viewport: Size, nodes: GraphCalloutObstacle[] = []) {
  if (anchor.x < 0 || anchor.y < 0 || anchor.x > viewport.width || anchor.y > viewport.height) return null;
  const margin = 16;
  const right = 88; // Reserve the zoom-control column, including on narrow screens.
  const top = Math.min(156, viewport.height * 0.3);
  const gap = radius + 28;
  const width = Math.min(card.width, viewport.width - margin - right);
  const horizontalSpace = anchor.x - gap - margin >= width || viewport.width - right - anchor.x - gap >= width;
  const verticalSpace = Math.max(anchor.y - gap - top, viewport.height - margin - anchor.y - gap);
  const maxHeight = Math.max(80, Math.min(380, viewport.height - top - margin, horizontalSpace ? Infinity : verticalSpace));
  const height = Math.min(card.height, maxHeight);
  const candidates = [0, 36, 72].flatMap((extra) => {
    const space = gap + extra;
    return [
      ...[0.35, 0.65, 0, 1].flatMap((align) => [
        { x: anchor.x + space, y: anchor.y - height * align },
        { x: anchor.x - space - width, y: anchor.y - height * align },
      ]),
      ...[0.5, 0, 1].flatMap((align) => [
        { x: anchor.x - width * align, y: anchor.y + space },
        { x: anchor.x - width * align, y: anchor.y - space - height },
      ]),
      ...[-1, 1].flatMap((dx) => [-1, 1].map((dy) => ({
        x: anchor.x + (dx > 0 ? space : -space - width),
        y: anchor.y + (dy > 0 ? space : -space - height),
      }))),
    ];
  }).flatMap((candidate, index) => [-1, 1].map((side) => {
    const x = clamp(candidate.x, margin, viewport.width - right - width);
    const y = clamp(candidate.y, top, viewport.height - margin - height);
    const nearestX = clamp(anchor.x, x, x + width);
    const nearestY = clamp(anchor.y, y, y + height);
    const distance = Math.hypot(anchor.x - nearestX, anchor.y - nearestY);
    const points = connectCard(anchor, radius, x, y, width, height, side);
    const segments = points.slice(1).map((end, i) => {
      const start = points[i];
      const dx = end.x - start.x, dy = end.y - start.y;
      return { start, dx, dy, lengthSquared: dx * dx + dy * dy || 1 };
    });
    let crowding = 0;
    for (const node of nodes) {
      const clearance = Math.hypot(node.x - clamp(node.x, x, x + width), node.y - clamp(node.y, y, y + height)) - node.radius;
      if (clearance < 0) crowding += 1000;
      else if (clearance < 24) crowding += (24 - clearance) * 4;
      const lineClearance = Math.min(...segments.map(({ start, dx, dy, lengthSquared }) => {
        const progress = clamp(((node.x - start.x) * dx + (node.y - start.y) * dy) / lengthSquared, 0, 1);
        return Math.hypot(node.x - start.x - progress * dx, node.y - start.y - progress * dy) - node.radius;
      }));
      if (lineClearance < 6) crowding += (6 - lineClearance) * 24;
    }
    const offscreen = points.reduce((sum, point) => sum + Math.max(0, -point.x, point.x - viewport.width) + Math.max(0, -point.y, point.y - viewport.height), 0);
    const diagonal = Math.abs(points[1].x - points[0].x) >= 8 && Math.abs(points[1].y - points[0].y) >= 8;
    const score = (distance < radius + 12 ? 1_000_000 : 0) + (diagonal ? 0 : 100_000) + offscreen * 2000 + crowding +
      Math.hypot(candidate.x - x, candidate.y - y) * 0.15 +
      segments.reduce((sum, segment) => sum + Math.hypot(segment.dx, segment.dy), 0) + index * 0.1;
    return { x, y, points, score };
  }));
  const best = candidates.reduce((a, b) => a.score <= b.score ? a : b);
  return {
    x: best.x, y: best.y, width, height, maxHeight,
    points: best.points,
    start: best.points[0],
    end: best.points[best.points.length - 1],
  };
}
