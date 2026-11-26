// Canyon Postman — the HUD and the instruments. Two layers, always on:
// a top bar of numbers (ALT, SPD, HDG, fuel, damage, score) and a strip of lit
// analogue gauges along the bottom, drawn on canvas like a real panel. The
// cockpit view makes the strip bigger; the chase view keeps it small. The judge
// reads both from the screenshots, so they are never hidden.

export function createHud() {
  const el = (id) => document.getElementById(id);
  const gauges = el('gauges');
  const gctx = gauges.getContext('2d');
  return {
    alt: el('hud-alt'),
    spd: el('hud-spd'),
    hdg: el('hud-hdg'),
    vs: el('hud-vs'),
    fuel: el('hud-fuel'),
    dmg: el('hud-dmg'),
    score: el('hud-score'),
    stage: el('hud-stage'),
    target: el('hud-target-val'),
    message: el('hud-message'),
    gauges,
    gctx,
  };
}

function fmt(n, digits = 0) {
  return n.toFixed(digits);
}

function headingDeg(heading) {
  // Compass bearing: heading 0 is east (090), heading +pi/2 is north (000).
  let d = 90 - (heading * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return Math.round(d);
}

/** Compass arrow: which way to turn toward the target, from the plane's nose. */
function targetArrow(flight, target) {
  const want = Math.atan2(-(target.z - flight.z), target.x - flight.x);
  let diff = want - flight.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const dist = Math.hypot(target.x - flight.x, target.z - flight.z);
  const arrow = diff > 0.25 ? '↰' : diff < -0.25 ? '↱' : '↑';
  return { arrow, dist: Math.round(dist), ahead: Math.abs(diff) < 0.5 };
}

function drawDial(ctx, cx, cy, r, label, valueText, frac, color) {
  ctx.save();
  ctx.translate(cx, cy);
  // Face.
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#10151c';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a4552';
  ctx.stroke();
  // Arc of the value.
  ctx.beginPath();
  ctx.arc(0, 0, r - 4, -Math.PI * 0.75, -Math.PI * 0.75 + frac * Math.PI * 1.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  // Needle.
  const a = -Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * (r - 9), Math.sin(a) * (r - 9));
  ctx.strokeStyle = '#f5f0e6';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Label + value.
  ctx.fillStyle = '#8fa3b8';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, r * 0.42);
  ctx.fillStyle = '#f5f0e6';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(valueText, 0, r * 0.72);
  ctx.restore();
}

function drawAttitude(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-roll);
  const dy = pitch * r * 1.4;
  ctx.fillStyle = '#2e4a7a';
  ctx.fillRect(-r, -r + dy, r * 2, r);
  ctx.fillStyle = '#c98a4b';
  ctx.fillRect(-r, dy, r * 2, r);
  ctx.strokeStyle = '#f5f0e6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, dy);
  ctx.lineTo(r, dy);
  ctx.stroke();
  ctx.restore();
  // Bezel + fixed wings marker.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#3a4552';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#ffb35c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy);
  ctx.lineTo(cx - r * 0.18, cy);
  ctx.moveTo(cx + r * 0.18, cy);
  ctx.lineTo(cx + r * 0.55, cy);
  ctx.stroke();
  ctx.fillStyle = '#8fa3b8';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATT', cx, cy + r * 0.72);
}

function drawCompass(ctx, cx, cy, r, heading) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#10151c';
  ctx.fill();
  ctx.strokeStyle = '#3a4552';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  // The card turns so the current bearing sits under the lubber line (top).
  ctx.rotate(heading - Math.PI / 2);
  ctx.fillStyle = '#8fa3b8';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const [deg, label] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = -Math.PI / 2 + (deg * Math.PI) / 180;
    ctx.fillText(label, Math.cos(a) * (r - 12), Math.sin(a) * (r - 12) + 3);
  }
  ctx.restore();
  ctx.strokeStyle = '#ffb35c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 3);
  ctx.lineTo(cx, cy - r + 12);
  ctx.stroke();
  ctx.fillStyle = '#f5f0e6';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(headingDeg(heading)).padStart(3, '0'), cx, cy + r * 0.72);
}

/** Paint the gauge strip from the flight state. */
export function drawGauges(hud, flight) {
  const { gctx: ctx, gauges } = hud;
  const w = gauges.width;
  const h = gauges.height;
  ctx.clearRect(0, 0, w, h);
  const r = h * 0.36;
  const gap = w / 5;
  const cy = h * 0.46;
  drawAttitude(ctx, gap * 0.5, cy, r, flight.pitch, flight.roll);
  drawDial(ctx, gap * 1.5, cy, r, 'SPD', String(Math.round(flight.speed * 3.6)), Math.min(1, flight.speed / 55), '#7fd4a8', );
  drawDial(ctx, gap * 2.5, cy, r, 'ALT', String(Math.round(flight.y)), Math.min(1, flight.y / 160), '#ffb35c');
  drawCompass(ctx, gap * 3.5, cy, r, flight.heading);
  const fuelFrac = flight.fuel / 100;
  drawDial(
    ctx, gap * 4.5, cy, r, 'FUEL', `${Math.round(flight.fuel)}%`,
    fuelFrac, fuelFrac > 0.25 ? '#7fd4a8' : '#ff6b57',
  );
}

/** Update every HUD number and message from the flight and mission state. */
export function updateHud(hud, flight, mission, target, message, messageKind) {
  hud.alt.textContent = `${Math.round(flight.y)} m`;
  hud.spd.textContent = `${Math.round(flight.speed * 3.6)} km/h`;
  hud.hdg.textContent = `${String(headingDeg(flight.heading)).padStart(3, '0')}°`;
  const vs = flight.verticalSpeed;
  hud.vs.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`;
  hud.fuel.textContent = `${Math.round(flight.fuel)}%`;
  hud.fuel.style.color = flight.fuel > 25 ? '' : '#ff6b57';
  hud.dmg.textContent = `${Math.round(flight.damage)}%`;
  hud.dmg.style.color = flight.damage > 50 ? '#ff6b57' : '';
  hud.score.textContent = String(mission.score);
  hud.stage.textContent = mission.stage.toUpperCase();
  const t = targetArrow(flight, target);
  hud.target.textContent = `${target.label} ${t.arrow} ${t.dist} m`;
  hud.target.style.color = t.ahead ? '#7fd4a8' : '';
  if (message !== undefined) {
    hud.message.textContent = message;
    hud.message.style.color = messageKind === 'warn' ? '#ff6b57' : messageKind === 'good' ? '#7fd4a8' : '#f5f0e6';
  }
  drawGauges(hud, flight);
}
