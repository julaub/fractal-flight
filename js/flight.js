// v4.0 free flight: orientation is an orthonormal triad rotated incrementally
// in the craft's own body frame (Rodrigues) — no Euler angles, no gimbal lock.
// Also owns the chase camera and the grind-then-crash ground contact.

import { WATER_LEVEL, GRIND_DEPTH, START } from './config.js';
import { craft, craftB, camPos, flags, probe } from './state.js';
import { normalize3, cross3, rotV, clamp1 } from './math.js';
import { keys, touchInput, gyroInput, mouse } from './input.js';
import { terrainShapeJ } from './terrain.js';
import { doCrash, unCrash } from './hud.js';
import { collectTree } from './spores.js';
import { updateRings, initRings } from './rings.js';
import { fireGun, updateBullets, updateBombs, resolveBlasts } from './weapons.js';
import { driftClouds, cloudImmersion } from './clouds.js';
import { engineUpdate, grindUpdate, cloudWindUpdate } from './audio.js';
import { emitTrail } from './fx.js';

// v4.0 chase camera: its own persistent triad, eased toward the craft's each
// frame — through a loop the camera's horizon rolls over with the plane.
let camR = [-1, 0, 0], camU = [0, 1, 0], camF = [0, 0, 1];

export function resetFlight() {
  craft.pos = [START.x, START.y, START.z];
  craft.r = [-1, 0, 0]; craft.u = [0, 1, 0]; craft.f = [0, 0, 1];
  craft.rollVel = 0; craft.pitchVel = 0;
  craft.speed = 95;
  camR = [-1, 0, 0]; camU = [0, 1, 0]; camF = [0, 0, 1];
  unCrash();
  initRings();
}

let sndBend = 0;   // engine pitch bend in octaves: W/Q held → down, S/E held → up
export let grindAmt = 0;          // 0..1 this frame — drives rumble volume + camera shake
export function update(dt, now) {
  if (flags.crashed) {
    // frozen scene: keep rendering the wreck site, wait for R
    const b = craftB();
    const cf = normalize3([craft.pos[0] - camPos[0], craft.pos[1] - camPos[1], craft.pos[2] - camPos[2]]);
    let cr = cross3(cf, [0, 1, 0]);
    const crl = Math.hypot(cr[0], cr[1], cr[2]);
    cr = crl > 1e-4 ? [cr[0]/crl, cr[1]/crl, cr[2]/crl] : [-1, 0, 0];
    const cu = cross3(cr, cf);
    grindAmt = 0;
    engineUpdate(0, false, 0, 0);
    grindUpdate(0);
    cloudWindUpdate(0);
    return { craftBasis: b,
             camBasis: { right: cr, up: cu, fwd: cf, mat: new Float32Array([...cr, ...cu, ...cf]) } };
  }
  // sum of all input sources (keyboard + joystick + gyro), clamped
  const steer = clamp1((keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + touchInput.steer + gyroInput.steer);   // inverted per pilot preference (v1.2)
  const pitchIn = clamp1((keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) + touchInput.pitch + gyroInput.pitch); // W nose down, S nose up
  const lift = clamp1((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0) + touchInput.lift);
  const boost = keys.ShiftLeft || keys.ShiftRight || touchInput.boost;

  // ---- v4.0 FREE FLIGHT ----
  // A/D roll and W/S pitch are applied as incremental rotations in the
  // craft's OWN body frame (Rodrigues), so orientation is unrestricted:
  // hold S through a full 360° loop, roll inverted, fly knife-edge — the
  // triad never gimbal-locks. Turning = bank (A/D) then pull (S), like a
  // real aircraft. Angular rates are eased for feel.
  const ROLL_RATE = 2.0, PITCH_RATE = 1.15;   // rad/s at full deflection
  // SPACE = full FREE FLIGHT mode (v6.0; was Y — e.code is physical-position
  // based, so on QWERTZ keyboards the key labeled Y reports 'KeyZ'; Space is
  // layout-independent). Space released: jul's arcade — bank sprung toward
  // ~49° max, hands-off auto-level, nose eases back to the horizon (loops
  // via W/S still work: pitch integrates freely while held). Space HELD:
  // the raw v4.6 triad — free roll rate, NO auto-level, NO pitch decay —
  // barrel rolls, knife-edge, sustained inverted flight.
  const rollFree = !!keys.Space;
  craft.rollVel  += ((rollFree ? steer * ROLL_RATE : 0) - craft.rollVel) * Math.min(1, dt * 6);
  craft.pitchVel += (pitchIn * PITCH_RATE - craft.pitchVel) * Math.min(1, dt * 6);
  if (Math.abs(craft.rollVel) > 1e-4) {
    const a = -craft.rollVel * dt;            // sign preserves v1.5 bank direction
    craft.r = rotV(craft.r, craft.f, a);
    craft.u = rotV(craft.u, craft.f, a);
  }
  if (Math.abs(craft.pitchVel) > 1e-4) {
    const a = craft.pitchVel * dt;
    craft.f = rotV(craft.f, craft.r, a);
    craft.u = rotV(craft.u, craft.r, a);
  }
  // arcade banked steering (Y released): spring the bank toward steer·0.85
  // rad (~49°, jul's max bank) at jul's 4.0/s ease — press-and-hold turns at
  // a fixed bank, analog joystick deflection gives proportional bank
  if (!rollFree && steer !== 0 && Math.abs(craft.f[1]) < 0.99) {
    const tu = normalize3([-craft.f[0] * craft.f[1], 1 - craft.f[1] * craft.f[1], -craft.f[2] * craft.f[1]]);
    const cx = cross3(craft.u, tu);
    const sinA = cx[0] * craft.f[0] + cx[1] * craft.f[1] + cx[2] * craft.f[2];
    const cosA = craft.u[0] * tu[0] + craft.u[1] * tu[1] + craft.u[2] * tu[2];
    const toLevel = Math.atan2(sinA, cosA);
    const a = (toLevel - steer * 0.85) * Math.min(1, dt * 4.0);
    craft.r = rotV(craft.r, craft.f, a);
    craft.u = rotV(craft.u, craft.f, a);
  }
  // ---- hands-off auto-stabilize (v5.4): jul's arcade feel on the free triad.
  // Jul's model treats roll/pitch as sprung ANGLES (roll eases to a steer
  // target at 4.0/s; released pitch decays 0.5^(0.7·dt)); ours are free RATES
  // so loops and barrel rolls work. The reconciliation: while a key is held
  // the triad rotates freely, and on release jul's exact spring curves take
  // over. Gates keep aerobatics pure: A/D held = no leveling at all; W/S held
  // = no ROLL leveling, so a loop is never flipped at its inverted apex (that
  // was the v5.4 "barrel roll at the top of the loop" bug); pitch decay only
  // engages near-upright — from a steep bank the roll spring rights the plane
  // first and the nose then settles, a natural two-beat recovery.
  if (!rollFree && steer === 0 && pitchIn === 0 && Math.abs(craft.f[1]) < 0.99) {
    // bank spring to level, from ANY bank (even inverted), engaged the moment
    // the keys are released: world up projected ⊥ forward, angle about f
    const tu = normalize3([-craft.f[0] * craft.f[1], 1 - craft.f[1] * craft.f[1], -craft.f[2] * craft.f[1]]);
    const cx = cross3(craft.u, tu);
    const sinA = cx[0] * craft.f[0] + cx[1] * craft.f[1] + cx[2] * craft.f[2];
    const cosA = craft.u[0] * tu[0] + craft.u[1] * tu[1] + craft.u[2] * tu[2];
    const a = Math.atan2(sinA, cosA) * Math.min(1, dt * 4.0);   // jul's return rate
    craft.r = rotV(craft.r, craft.f, a);
    craft.u = rotV(craft.u, craft.f, a);
  }
  if (!rollFree && pitchIn === 0 && craft.u[1] > 0.3) {
    // nose-to-horizon decay, exactly jul's curve: pitch *= 0.5^(0.7·dt)
    const p = Math.asin(Math.max(-1, Math.min(1, craft.f[1])));
    const a = -p * (1 - Math.pow(0.5, dt * 0.7));
    craft.f = rotV(craft.f, craft.r, a);
    craft.u = rotV(craft.u, craft.r, a);
  }
  // coordinated turn (v4.1): a banked wing curves the flight path toward the
  // low wing, restoring v1's bank-to-turn feel inside free flight. The whole
  // triad rotates about the WORLD vertical at a rate proportional to bank
  // (r[1] = sin(bank) when upright; 1.2 matches the old turn rate at ~45°),
  // gated by max(0, u[1]) so it fades to ZERO at knife-edge, inverted, and
  // through loops — aerobatics stay pure, cruising turns fly themselves.
  // v6.0: while actively rolling in free-flight mode (SPACE + A/D) this yaw
  // term would nudge the nose every frame and precess the roll axis — the
  // barrel-roll "wobble". It fades out with roll rate and returns as the
  // roll stops, so banked turning in free mode is untouched.
  const rollSteady = rollFree ? Math.max(0, 1 - Math.abs(craft.rollVel) / 0.6) : 1;
  const turnRate = craft.r[1] * 1.2 * Math.max(0, craft.u[1]) * rollSteady;
  if (Math.abs(turnRate) > 1e-4) {
    const a = turnRate * dt, Y = [0, 1, 0];
    craft.f = rotV(craft.f, Y, a);
    craft.r = rotV(craft.r, Y, a);
    craft.u = rotV(craft.u, Y, a);
  }
  // re-orthonormalize the triad (kills numeric drift; same handedness as v1)
  craft.f = normalize3(craft.f);
  craft.r = normalize3(cross3(craft.f, craft.u));
  craft.u = cross3(craft.r, craft.f);

  // speed: throttle target plus a light energy exchange — dives gain speed,
  // climbs bleed it, so the top of a loop feels appropriately slow
  const targetSpeed = boost ? 280 : 95;
  craft.speed += (targetSpeed - craft.speed) * Math.min(1, dt * 2.0);
  craft.speed = Math.max(60, Math.min(330, craft.speed - craft.f[1] * 45 * dt));

  const b = craftB();
  craft.pos[0] += b.fwd[0] * craft.speed * dt;
  craft.pos[1] += b.fwd[1] * craft.speed * dt + lift * 110 * dt;
  craft.pos[2] += b.fwd[2] * craft.speed * dt;

  // ---- collision = end of flight ----
  // GPU probe value = exactly the terrain the pixels show (fp32), refreshed
  // every frame. Fp64 JS mirror only bridges the first frame before readback.
  const groundH = (probe.ground !== null) ? probe.ground : terrainShapeJ(craft.pos[0], craft.pos[2]);
  // Two-stage terrain contact (v3.1): touching the surface only GRINDS —
  // rumble, camera shake, speed bleed — the fatal crash sits GRIND_DEPTH
  // below the old contact level. A shallow, near-horizontal descent scrapes
  // along the ground with time to pull up; a steep dive punches through the
  // whole band within a frame or two and still crashes essentially on impact.
  const grindTop   = groundH + 1.3;             // old crash level = first contact
  const crashLevel = grindTop - GRIND_DEPTH;    // the real collision, under the surface
  grindAmt = 0;
  if (craft.pos[1] < crashLevel) {
    craft.pos[1] = crashLevel;
    doCrash('TERRAIN IMPACT');
  } else if (craft.pos[1] < WATER_LEVEL + 1.0) {
    craft.pos[1] = WATER_LEVEL + 1.0;
    doCrash('SPLASHDOWN');
  } else {
    if (craft.pos[1] < grindTop) {
      grindAmt = Math.min(1, (grindTop - craft.pos[1]) / GRIND_DEPTH);
      craft.speed -= craft.speed * grindAmt * dt * 0.55;   // ground friction bleeds speed
    }
    if (probe.plantD < 2.2) collectTree();   // trees are spores to harvest, not walls (v1.7)
  }

  updateRings(craft.pos, b.fwd, dt);   // ring course: pass-through scoring + respawn

  updateBullets(dt);   // tracers fly (and hit) independently of the craft
  updateBombs(dt);     // bombs fall straight down, detonate on the GPU's ground
  resolveBlasts();     // settle last frame's blast probe, arm the next
  // clouds drift with the wind; wind noise swells when flying through one
  driftClouds(dt);
  cloudWindUpdate(cloudImmersion());
  // hold-to-burst: left button held keeps firing (~8.7/s), throttled by the
  // 8-slot magazine — a full burst, a beat while tracers land, another burst.
  if (mouse.lmbDown && now - mouse.lastAuto >= 115) { fireGun(); mouse.lastAuto = now; }

  // engine + contrails
  const boosting = !!boost;
  // W (dive) and Q (altitude down) bend the engine pitch down for as long as
  // held; S and E bend it up; released, it relaxes back over ~a second.
  const bendIn = ((keys.KeyS ? 1 : 0) + (keys.KeyE ? 1 : 0)) - ((keys.KeyW ? 1 : 0) + (keys.KeyQ ? 1 : 0));
  if (bendIn < 0)      sndBend = Math.max(-1.3, sndBend - dt * 0.85);
  else if (bendIn > 0) sndBend = Math.min( 1.3, sndBend + dt * 0.85);
  else                 sndBend *= Math.pow(0.5, dt / 0.7);
  const turn = Math.min(1, Math.max(0, 1 - craft.u[1]));   // 0 upright → 1 knife-edge/inverted
  engineUpdate(craft.speed, boosting, sndBend, turn);
  grindUpdate(grindAmt);
  if (!flags.crashed && craft.speed > 70) emitTrail(b, now, boosting);

  // chase cam v4.0: the camera keeps its own triad and eases it toward the
  // craft's — through a loop the horizon rolls over with you; inverted
  // flight looks inverted. Position hangs behind/above along the CAMERA's
  // axes so it swings smoothly instead of snapping with the plane.
  const lookAt = [
    craft.pos[0] + b.fwd[0] * 30,
    craft.pos[1] + b.fwd[1] * 30,
    craft.pos[2] + b.fwd[2] * 30
  ];
  const kv = Math.min(1, dt * 4.2);
  const tF = normalize3([lookAt[0] - camPos[0], lookAt[1] - camPos[1], lookAt[2] - camPos[2]]);
  camF = normalize3([camF[0] + (tF[0] - camF[0]) * kv,
                     camF[1] + (tF[1] - camF[1]) * kv,
                     camF[2] + (tF[2] - camF[2]) * kv]);
  // camera roll-follow (v5.4): jul's camera rolls only 30% with the plane,
  // keeping the horizon ~level in arcade turns — that is what makes the 49°
  // bank READ on screen (a fully rolling camera makes the same bank look
  // flat). Follow the craft's up ~35% when cruising/turning, ramping to 100%
  // for real aerobatics (steep bank, big pitch, or SPACE held) so loops,
  // barrel rolls and inverted flight still roll the horizon with you.
  const bankAmt = 1 - Math.max(0, craft.u[1]);
  const aero = rollFree ? 1 : Math.max(
    Math.min(1, Math.max(0, (bankAmt - 0.35) / 0.35)),
    Math.min(1, Math.max(0, (Math.abs(craft.f[1]) - 0.45) / 0.3)));
  const wF = 0.35 + 0.65 * aero;
  const clu = normalize3([-craft.f[0] * craft.f[1], 1 - craft.f[1] * craft.f[1], -craft.f[2] * craft.f[1]]);
  const cuT = [clu[0] * (1 - wF) + craft.u[0] * wF,
               clu[1] * (1 - wF) + craft.u[1] * wF,
               clu[2] * (1 - wF) + craft.u[2] * wF];
  const uT = [camU[0] + (cuT[0] - camU[0]) * kv,
              camU[1] + (cuT[1] - camU[1]) * kv,
              camU[2] + (cuT[2] - camU[2]) * kv];
  let nR = cross3(camF, uT);
  const nRl = Math.hypot(nR[0], nR[1], nR[2]);
  if (nRl > 1e-4) {          // degenerate only if looking straight along up
    camR = [nR[0]/nRl, nR[1]/nRl, nR[2]/nRl];
    camU = cross3(camR, camF);
  }
  const desired = [
    craft.pos[0] - camF[0] * 17 + camU[0] * 5.5,
    craft.pos[1] - camF[1] * 17 + camU[1] * 5.5,
    craft.pos[2] - camF[2] * 17 + camU[2] * 5.5
  ];
  const k = Math.min(1, dt * 3.5);
  camPos[0] += (desired[0] - camPos[0]) * k;
  camPos[1] += (desired[1] - camPos[1]) * k;
  camPos[2] += (desired[2] - camPos[2]) * k;

  return { craftBasis: b,
           camBasis: { right: camR, up: camU, fwd: camF, mat: new Float32Array([...camR, ...camU, ...camF]) } };
}
