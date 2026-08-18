const KNOT_TO_NM_PER_SECOND = 1 / 3600;
const DEG_TO_RAD = Math.PI / 180;
const NM_PER_LATITUDE_DEGREE = 60;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const shortestAngle = (from, to) => {
  const delta = ((to - from + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
};

const approach = (current, target, speed, dt) => {
  const delta = target - current;
  const step = speed * dt;
  return Math.abs(delta) <= step ? target : current + Math.sign(delta) * step;
};

const DEFAULT_INPUT = Object.freeze({
  pitch: 0,
  roll: 0,
  throttle: 0,
  autopilot: false,
  resetAttitude: false,
});

export class FlightModel {
  constructor(options = {}) {
    const startMode = options.startMode ?? "airborne";
    const isAirborne = startMode === "airborne";
    const fuel = clamp(Number(options.fuel ?? 72), 0, 100);

    this.state = {
      lat: Number(options.lat ?? 46.5197),
      lon: Number(options.lon ?? 6.6323),
      heading: ((Number(options.heading ?? 0) % 360) + 360) % 360,
      altitude: isAirborne ? Number(options.altitude ?? 2200) : 0,
      speed: isAirborne ? Number(options.speed ?? 105) : 0,
      verticalSpeed: 0,
      pitch: isAirborne ? 1.5 : 0,
      roll: 0,
      throttle: isAirborne ? 0.72 : startMode === "runway" ? 0.18 : 0,
      fuel,
      airborne: isAirborne,
      crashed: false,
      landed: false,
      distanceNm: 0,
      elapsedSeconds: 0,
      event: isAirborne ? "airborne" : "ground",
      impactRate: 0,
    };

    this.startMode = startMode;
    this.windStrength = clamp(Number(options.windStrength ?? 0), 0, 1);
    this.autopilot = {
      enabled: false,
      altitude: this.state.altitude,
      heading: this.state.heading,
      speed: Math.max(this.state.speed, 100),
    };
    this._eventRevision = 0;
  }

  setAutopilot(enabled) {
    const next = Boolean(enabled) && this.state.airborne && !this.state.crashed;
    if (next && !this.autopilot.enabled) {
      this.autopilot.altitude = Math.max(500, this.state.altitude);
      this.autopilot.heading = this.state.heading;
      this.autopilot.speed = clamp(this.state.speed, 80, 125);
      this._setEvent("autopilot-on");
    } else if (!next && this.autopilot.enabled) {
      this._setEvent("autopilot-off");
    }
    this.autopilot.enabled = next;
    return next;
  }

  setAutopilotTarget({ altitude, heading, speed } = {}) {
    if (Number.isFinite(altitude)) this.autopilot.altitude = clamp(altitude, 500, 14000);
    if (Number.isFinite(heading)) this.autopilot.heading = ((heading % 360) + 360) % 360;
    if (Number.isFinite(speed)) this.autopilot.speed = clamp(speed, 75, 130);
  }

  step(deltaSeconds, controls = DEFAULT_INPUT) {
    if (this.state.crashed || this.state.landed) return this.snapshot();
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.12);
    if (!dt) return this.snapshot();

    const input = { ...DEFAULT_INPUT, ...controls };
    this.state.elapsedSeconds += dt;

    if (input.autopilot !== this.autopilot.enabled) this.setAutopilot(input.autopilot);

    let rollInput = clamp(input.roll, -1, 1);
    let pitchInput = clamp(input.pitch, -1, 1);
    let throttleInput = clamp(input.throttle, -1, 1);

    if (this.autopilot.enabled) {
      const headingError = shortestAngle(this.state.heading, this.autopilot.heading);
      const altitudeError = this.autopilot.altitude - this.state.altitude;
      rollInput = clamp(headingError / 28 - this.state.roll / 35, -1, 1);
      pitchInput = clamp(altitudeError / 900 - this.state.verticalSpeed / 1500, -0.7, 0.7);
      throttleInput = clamp((this.autopilot.speed - this.state.speed) / 35, -0.65, 0.65);
    }

    if (input.resetAttitude) {
      rollInput = clamp(-this.state.roll / 10, -1, 1);
      pitchInput = clamp((1.5 - this.state.pitch) / 6, -1, 1);
    }

    const targetRoll = rollInput * 38;
    const targetPitch = pitchInput * 14 + (this.state.airborne ? 1.2 : 0);
    this.state.roll = approach(this.state.roll, targetRoll, 48, dt);
    this.state.pitch = approach(this.state.pitch, targetPitch, 28, dt);
    this.state.throttle = clamp(this.state.throttle + throttleInput * 0.32 * dt, 0, 1);

    const groundTargetSpeed = this.state.throttle * 88;
    const airTargetSpeed = 42 + this.state.throttle * 123 - Math.abs(this.state.pitch) * 0.7;
    const targetSpeed = this.state.airborne ? airTargetSpeed : groundTargetSpeed;
    const acceleration = this.state.airborne ? 0.31 : 0.48;
    this.state.speed += (targetSpeed - this.state.speed) * acceleration * dt;
    this.state.speed = clamp(this.state.speed, 0, 165);

    if (!this.state.airborne && this.startMode === "parking" && this.state.throttle < 0.12) {
      this.state.speed = Math.max(0, this.state.speed - 7 * dt);
    }

    if (!this.state.airborne && this.state.speed > 52 && this.state.pitch > 3.2) {
      this.state.airborne = true;
      this.state.altitude = 1;
      this._setEvent("takeoff");
    }

    if (this.state.airborne) {
      const lowSpeedPenalty = Math.max(0, 55 - this.state.speed) * 24;
      const targetVerticalSpeed = this.state.pitch * 112 + (this.state.speed - 82) * 2.1 - lowSpeedPenalty;
      this.state.verticalSpeed += (targetVerticalSpeed - this.state.verticalSpeed) * 0.72 * dt;
      this.state.verticalSpeed = clamp(this.state.verticalSpeed, -2600, 2200);
      this.state.altitude += (this.state.verticalSpeed / 60) * dt;

      const airspeedFactor = clamp(this.state.speed / 100, 0.35, 1.35);
      const turnRate = this.state.roll * 0.115 * airspeedFactor;
      const windGust = this.windStrength * Math.sin(this.state.elapsedSeconds * 1.7) * 0.18;
      this.state.heading = (this.state.heading + (turnRate + windGust) * dt + 360) % 360;

      if (this.state.altitude <= 0) this._touchGround();
    } else {
      const steeringRate = this.state.roll * 0.045 * clamp(this.state.speed / 20, 0, 1);
      this.state.heading = (this.state.heading + steeringRate * dt + 360) % 360;
      this.state.verticalSpeed = 0;
      this.state.altitude = 0;
    }

    this._move(dt);
    this.state.fuel = clamp(
      this.state.fuel - (0.55 + this.state.throttle * 1.8) * (dt / 3600) * 20,
      0,
      100,
    );

    if (this.state.fuel <= 0) {
      this.state.throttle = 0;
      this.autopilot.enabled = false;
      this._setEvent("fuel-empty");
    }

    return this.snapshot();
  }

  snapshot() {
    return {
      ...this.state,
      autopilot: this.autopilot.enabled,
      autopilotTarget: { ...this.autopilot },
      eventRevision: this._eventRevision,
    };
  }

  _move(dt) {
    if (this.state.speed < 0.05) return;
    const distanceNm = this.state.speed * KNOT_TO_NM_PER_SECOND * dt;
    const headingRad = this.state.heading * DEG_TO_RAD;
    const latitudeDelta = (Math.cos(headingRad) * distanceNm) / NM_PER_LATITUDE_DEGREE;
    const longitudeScale = Math.max(0.08, Math.cos(this.state.lat * DEG_TO_RAD));
    const longitudeDelta = (Math.sin(headingRad) * distanceNm) / (NM_PER_LATITUDE_DEGREE * longitudeScale);
    this.state.lat = clamp(this.state.lat + latitudeDelta, -85, 85);
    this.state.lon = ((this.state.lon + longitudeDelta + 540) % 360) - 180;
    this.state.distanceNm += distanceNm;
  }

  _touchGround() {
    const impact = this.state.verticalSpeed;
    const safe = impact > -480 && Math.abs(this.state.roll) < 14 && this.state.pitch > -8 && this.state.speed < 96;
    this.state.altitude = 0;
    this.state.impactRate = impact;
    this.state.airborne = false;
    this.autopilot.enabled = false;

    if (safe) {
      this.state.landed = true;
      this.state.speed = Math.min(this.state.speed, 35);
      this.state.verticalSpeed = 0;
      this._setEvent("landed");
    } else {
      this.state.crashed = true;
      this.state.speed = 0;
      this.state.verticalSpeed = 0;
      this._setEvent("crashed");
    }
  }

  _setEvent(event) {
    if (this.state.event !== event) {
      this.state.event = event;
      this._eventRevision += 1;
    }
  }
}
