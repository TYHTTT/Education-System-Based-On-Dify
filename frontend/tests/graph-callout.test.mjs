import assert from "node:assert/strict";
import test from "node:test";
import { placeGraphCallout } from "../lib/graph-callout.ts";

for (const viewport of [{ width: 1440, height: 903 }, { width: 390, height: 755 }, { width: 320, height: 520 }]) {
  test(`node callouts stay visible and clear of their node at ${viewport.width}px`, () => {
    for (const anchor of [
      { x: 12, y: 170 },
      { x: viewport.width - 12, y: 170 },
      { x: 12, y: viewport.height - 12 },
      { x: viewport.width - 12, y: viewport.height - 12 },
      { x: viewport.width / 2, y: viewport.height / 2 },
    ]) {
      const radius = 8;
      const card = placeGraphCallout(anchor, radius, { width: 310, height: 380 }, viewport);
      assert.ok(card);
      assert.ok(card.x >= 16 && card.y >= 0);
      assert.ok(card.x + card.width <= viewport.width - 88, "card leaves zoom controls clear");
      assert.ok(card.y + card.height <= viewport.height - 16);
      const nearestX = Math.max(card.x, Math.min(card.x + card.width, anchor.x));
      const nearestY = Math.max(card.y, Math.min(card.y + card.height, anchor.y));
      assert.ok(Math.hypot(anchor.x - nearestX, anchor.y - nearestY) >= radius + 12);
      assert.ok(Math.abs(Math.hypot(card.start.x - anchor.x, card.start.y - anchor.y) - radius) < 0.001);
      assert.ok(card.end.x === card.x || card.end.x === card.x + card.width);
      assert.equal(card.end.y, card.y + card.height / 2, "leader ends at the side midpoint");
      assert.equal(card.points.length, 3, "leader has one elbow");
      assert.ok(Math.abs(card.points[1].x - card.start.x) >= 8 && Math.abs(card.points[1].y - card.start.y) >= 8, "first segment is diagonal");
      for (let i = 1; i < card.points.length; i++) {
        const from = card.points[i - 1], to = card.points[i];
        for (let step = 0; step < 20; step++) {
          const point = { x: from.x + (to.x - from.x) * step / 20, y: from.y + (to.y - from.y) * step / 20 };
          assert.ok(point.x < card.x || point.x > card.x + card.width || point.y < card.y || point.y > card.y + card.height, "leader stays outside the card");
        }
      }
      const beforeEnd = card.points.at(-2);
      assert.equal(beforeEnd.y, card.end.y, "last segment is horizontal");
      assert.ok(Math.abs(beforeEnd.x - card.end.x) >= 24);
    }
  });
}

test("callouts follow a moving anchor and hide when it leaves the canvas", () => {
  const viewport = { width: 1600, height: 1000 };
  const card = { width: 310, height: 240 };
  const a = placeGraphCallout({ x: 500, y: 450 }, 8, card, viewport);
  const b = placeGraphCallout({ x: 560, y: 490 }, 8, card, viewport);
  assert.equal(b.x - a.x, 60);
  assert.equal(b.y - a.y, 40);
  assert.equal(placeGraphCallout({ x: -1, y: 300 }, 8, card, viewport), null);
  assert.equal(placeGraphCallout({ x: 800, y: 1001 }, 8, card, viewport), null);
});

for (const direction of ["right", "left", "above", "below"]) {
  test(`callouts prefer empty space ${direction} of the selected node`, () => {
    const anchor = { x: 800, y: 500 };
    const nodes = [];
    for (let x = 50; x < 1750; x += 35) {
      for (let y = 170; y < 950; y += 35) {
        const empty = direction === "right" ? x > anchor.x + 20
          : direction === "left" ? x < anchor.x - 20
          : direction === "above" ? y < anchor.y - 20 : y > anchor.y + 20;
        if (!empty && Math.hypot(x - anchor.x, y - anchor.y) > 15) nodes.push({ x, y, radius: 5 });
      }
    }
    const card = placeGraphCallout(anchor, 8, { width: 310, height: 240 }, { width: 1800, height: 1000 }, nodes);
    assert.ok(card);
    if (direction === "right") assert.ok(card.x > anchor.x);
    if (direction === "left") assert.ok(card.x + card.width < anchor.x);
    if (direction === "above") assert.ok(card.y + card.height < anchor.y);
    if (direction === "below") assert.ok(card.y > anchor.y);
    assert.ok(nodes.every(node => node.x < card.x - node.radius || node.x > card.x + card.width + node.radius || node.y < card.y - node.radius || node.y > card.y + card.height + node.radius));
  });
}

test("the connector avoids intervening nodes even when the card area is empty", () => {
  const anchor = { x: 800, y: 500 };
  const obstacle = { x: 820, y: 500, radius: 6 };
  const card = placeGraphCallout(anchor, 8, { width: 310, height: 240 }, { width: 1800, height: 1000 }, [obstacle]);
  for (let i = 1; i < card.points.length; i++) {
    const start = card.points[i - 1], end = card.points[i];
    const dx = end.x - start.x, dy = end.y - start.y;
    const progress = Math.max(0, Math.min(1, ((obstacle.x - start.x) * dx + (obstacle.y - start.y) * dy) / (dx * dx + dy * dy)));
    assert.ok(Math.hypot(obstacle.x - start.x - progress * dx, obstacle.y - start.y - progress * dy) >= obstacle.radius + 6);
  }
});
