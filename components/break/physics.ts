// Small, deterministic pieces of the flight model, independent of the renderer.
export const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, n));

export function unitVector(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

// Sweep the whole bullet path so a fast shot cannot skip a pixel at low frame rates.
export function segmentHitsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSquared, 0, 1)
    : 0;
  return (x1 + dx * t - cx) ** 2 + (y1 + dy * t - cy) ** 2 <= radius * radius;
}

export type FlightState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bank: number;
  aimX: number;
  aimY: number;
  dashX: number;
  dashY: number;
  dashTime: number;
  dashCooldown: number;
  dashSpeed: number;
  focused: boolean;
};
export type FlightInput = {
  x: number;
  y: number;
  focused: boolean;
  target?: { x: number; y: number };
};
export type FlightBounds = { width: number; height: number };
export const DASH_DURATION = 0.14;
export const DASH_COOLDOWN = 1.15;

export function createFlightState(): FlightState {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    bank: 0,
    aimX: 0,
    aimY: -1,
    dashX: 0,
    dashY: -1,
    dashTime: 0,
    dashCooldown: 0,
    dashSpeed: 0,
    focused: false,
  };
}
export function flightSpeed(bounds: FlightBounds) {
  return clamp(Math.min(bounds.width, bounds.height) * 0.62, 220, 380);
}
export function dashFlight(
  body: FlightState,
  input: FlightInput,
  bounds: FlightBounds,
) {
  if (body.dashCooldown > 0) return false;
  const tx = input.target ? input.target.x - body.x : input.x;
  const ty = input.target ? input.target.y - body.y : input.y;
  const direction =
    Math.hypot(tx, ty) > 0.5
      ? unitVector(tx, ty)
      : { x: body.aimX, y: body.aimY };
  body.dashX = direction.x;
  body.dashY = direction.y;
  body.dashTime = DASH_DURATION;
  body.dashCooldown = DASH_COOLDOWN;
  body.dashSpeed =
    (clamp(Math.min(bounds.width, bounds.height) * 0.2, 72, 128) *
      (input.focused ? 0.8 : 1)) /
    DASH_DURATION;
  return true;
}

// Integrate velocity analytically. A release stops its axis immediately;
// acceleration and reversal stay consistent at different render rates.
export function stepFlight(
  body: FlightState,
  input: FlightInput,
  dt: number,
  bounds: FlightBounds,
) {
  const ox = body.x,
    oy = body.y,
    wasDashing = body.dashTime > 0;
  const speed = flightSpeed(bounds) * (input.focused ? 0.44 : 1);
  body.focused = input.focused;
  body.dashCooldown = Math.max(0, body.dashCooldown - dt);
  const direction = input.target
    ? unitVector(input.target.x - body.x, input.target.y - body.y)
    : unitVector(input.x, input.y);
  if (Math.abs(direction.x) + Math.abs(direction.y) > 0.1) {
    body.aimX = direction.x;
    body.aimY = direction.y;
  }

  if (wasDashing) {
    const elapsed = Math.min(dt, body.dashTime);
    body.x += body.dashX * body.dashSpeed * elapsed;
    body.y += body.dashY * body.dashSpeed * elapsed;
    body.dashTime = Math.max(0, body.dashTime - dt);
    body.vx = body.dashX * body.dashSpeed;
    body.vy = body.dashY * body.dashSpeed;
  } else if (input.target) {
    const dx = input.target.x - body.x,
      dy = input.target.y - body.y,
      distance = Math.hypot(dx, dy);
    const travel = Math.min(
      distance * (1 - Math.exp(-dt / 0.018)),
      speed * 1.45 * dt,
    );
    if (distance < 0.15) {
      body.x = input.target.x;
      body.y = input.target.y;
    } else {
      body.x += (dx / distance) * travel;
      body.y += (dy / distance) * travel;
    }
    body.vx = (body.x - ox) / dt;
    body.vy = (body.y - oy) / dt;
  } else {
    const integrate = (velocity: number, target: number) => {
      if (target === 0) return { velocity: 0, distance: 0 };
      const response = velocity * target < 0 ? 70 : 46,
        decay = Math.exp(-response * dt);
      return {
        velocity: target + (velocity - target) * decay,
        distance: target * dt + ((velocity - target) * (1 - decay)) / response,
      };
    };
    const x = integrate(body.vx, direction.x * speed),
      y = integrate(body.vy, direction.y * speed);
    body.x += x.distance;
    body.y += y.distance;
    body.vx = x.velocity;
    body.vy = y.velocity;
  }
  const x = clamp(body.x, 24, Math.max(24, bounds.width - 24)),
    y = clamp(body.y, 76, Math.max(76, bounds.height - 82));
  const wall = x !== body.x || y !== body.y;
  if (x !== body.x) body.vx = 0;
  if (y !== body.y) body.vy = 0;
  body.x = x;
  body.y = y;
  if (wasDashing && wall) body.dashTime = 0;
  const dashEnded = wasDashing && body.dashTime === 0;
  if (dashEnded) body.vx = body.vy = 0;
  const bank = clamp((body.x - ox) / (Math.max(1, speed) * dt), -1, 1) * 0.17;
  body.bank += (bank - body.bank) * (1 - Math.exp(-dt * 14));
  return { dashed: wasDashing, dashEnded };
}
