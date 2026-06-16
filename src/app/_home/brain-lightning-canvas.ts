type Point = { x: number; y: number };

type LightningBolt = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  xRange: number;
  yRange: number;
  path: Point[];
  pathLimit: number;
  canSpawn: boolean;
  hasFired: boolean;
};

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function createBolt(
  bolts: LightningBolt[],
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  canSpawn: boolean,
) {
  bolts.push({
    x,
    y,
    targetX,
    targetY,
    xRange: rand(4, 12),
    yRange: rand(4, 10),
    path: [{ x, y }],
    pathLimit: rand(14, 30),
    canSpawn,
    hasFired: false,
  });
}

function updateBolts(bolts: LightningBolt[], start: Point, end: Point, spawnChance: number) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const light = bolts[i];
    const last = light.path[light.path.length - 1];
    const dx = light.targetX - last.x;
    const dy = light.targetY - last.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 5) {
      light.path.push({ x: light.targetX, y: light.targetY });
      bolts.splice(i, 1);
      continue;
    }

    const step = rand(5, 14);
    const nx = last.x + (dx / dist) * step + (rand(0, light.xRange) - light.xRange / 2);
    const ny = last.y + (dy / dist) * step + (rand(0, light.yRange) - light.yRange / 2);

    light.path.push({ x: nx, y: ny });

    if (light.path.length > light.pathLimit) {
      bolts.splice(i, 1);
      continue;
    }

    if (light.canSpawn && light.path.length > 4 && rand(0, 140) === 0) {
      light.canSpawn = false;
      const branch = light.path[light.path.length - 1];
      createBolt(
        bolts,
        branch.x,
        branch.y,
        branch.x + rand(-18, 18),
        branch.y + rand(-14, 14),
        false,
      );
    }

    light.hasFired = true;
  }

  if (spawnChance > 0 && rand(0, Math.max(8, Math.round(36 / spawnChance))) === 0 && bolts.length < 2) {
    createBolt(bolts, start.x, start.y, end.x, end.y, false);
  }
}

function renderBolts(ctx: CanvasRenderingContext2D, bolts: LightningBolt[], intensity: number) {
  for (const light of bolts) {
    const alpha = (rand(14, 42) / 100) * intensity;
    ctx.strokeStyle = `hsla(265, 88%, 78%, ${alpha})`;
    ctx.lineWidth = rand(0, 70) === 0 ? 1.75 : 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(light.x, light.y);
    for (const point of light.path) {
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }
}

function fadeCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
) {
  ctx.globalCompositeOperation = "destination-out";
  const fadeStrength = 0.08 + (1 - intensity) * 0.22;
  ctx.fillStyle = `rgba(167, 139, 250, ${fadeStrength})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
}

function getFadeIntensity(elapsed: number, durationMs: number) {
  const progress = Math.min(1, elapsed / durationMs);
  if (progress < 0.18) return 1;
  const fadeProgress = (progress - 0.18) / 0.82;
  return Math.max(0, 1 - fadeProgress ** 1.35);
}

export function runBrainLightning(
  canvas: HTMLCanvasElement,
  start: Point,
  end: Point,
  durationMs: number,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bolts: LightningBolt[] = [];
  createBolt(bolts, start.x, start.y, end.x, end.y, true);

  const startedAt = performance.now();
  let frameId = 0;
  let stopped = false;

  const loop = (now: number) => {
    if (stopped) return;

    const elapsed = now - startedAt;
    if (elapsed >= durationMs) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const intensity = getFadeIntensity(elapsed, durationMs);
    const spawnChance = intensity > 0.35 ? intensity : 0;

    fadeCanvas(ctx, width, height, intensity);
    updateBolts(bolts, start, end, spawnChance);
    renderBolts(ctx, bolts, intensity);

    frameId = requestAnimationFrame(loop);
  };

  frameId = requestAnimationFrame(loop);

  return () => {
    stopped = true;
    cancelAnimationFrame(frameId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
