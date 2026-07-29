(() => {
  "use strict";

  const canvas = document.getElementById("sea");
  const ctx = canvas.getContext("2d");
  const mapCanvas = document.getElementById("map");
  const mapCtx = mapCanvas.getContext("2d");
  const wheelCanvas = document.getElementById("wheel");
  const wheelCtx = wheelCanvas.getContext("2d");
  const wheelWrap = document.getElementById("wheelWrap");

  const els = {
    speedVal: document.getElementById("speedVal"),
    rudderVal: document.getElementById("rudderVal"),
    nextSide: document.getElementById("nextSide"),
    timeVal: document.getElementById("timeVal"),
    passHudLabel: document.getElementById("passHudLabel"),
    passCount: document.getElementById("passCount"),
    passUnit: document.getElementById("passUnit"),
    penaltyHudLabel: document.getElementById("penaltyHudLabel"),
    penaltyCount: document.getElementById("penaltyCount"),
    throttle: document.getElementById("throttle"),
    throttleLabel: document.getElementById("throttleLabel"),
    startOverlay: document.getElementById("startOverlay"),
    startIntroPanel: document.getElementById("startIntroPanel"),
    startModePanel: document.getElementById("startModePanel"),
    playStartBtn: document.getElementById("playStartBtn"),
    startBackBtn: document.getElementById("startBackBtn"),
    resultOverlay: document.getElementById("resultOverlay"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    pauseBtn: document.getElementById("pauseBtn"),
    resumeBtn: document.getElementById("resumeBtn"),
    pauseEndBtn: document.getElementById("pauseEndBtn"),
    pauseLead: document.getElementById("pauseLead"),
    pauseEyebrow: document.getElementById("pauseEyebrow"),
    startPracticeBtn: document.getElementById("startPracticeBtn"),
    startEndlessBtn: document.getElementById("startEndlessBtn"),
    retryBtn: document.getElementById("retryBtn"),
    changeCourseBtn: document.getElementById("changeCourseBtn"),
    resultEndBtn: document.getElementById("resultEndBtn"),
    resetBtn: document.getElementById("resetBtn"),
    endBtn: document.getElementById("endBtn"),
    resultEyebrow: document.getElementById("resultEyebrow"),
    resultTitle: document.getElementById("resultTitle"),
    resultLead: document.getElementById("resultLead"),
    scoreBreakdown: document.getElementById("scoreBreakdown"),
    scoreList: document.getElementById("scoreList"),
    resultPanel: document.getElementById("resultPanel"),
    tutorialOverlay: document.getElementById("tutorialOverlay"),
    tutorialSpotlight: document.getElementById("tutorialSpotlight"),
    tutorialStepLabel: document.getElementById("tutorialStepLabel"),
    tutorialTitle: document.getElementById("tutorialTitle"),
    tutorialBody: document.getElementById("tutorialBody"),
    tutorialNextBtn: document.getElementById("tutorialNextBtn"),
  };

  const BUOY_COUNT = 3;
  const BUOY_SPACING = 360;
  const BUOY_RADIUS = 14;
  const PASS_GATE = 180;
  const GOAL_AFTER = 420;
  const FIRST_BUOY_OFFSET = 480;
  const ENDLESS_FIRST_BUOY_OFFSET = 420;
  const ENDLESS_AHEAD = 8;
  const ENDLESS_KM_EVERY = 2000;
  let nextBuoySeq = 0;
  const SCENERY_EVERY = 5;
  const COURSE_X = 0;
  const START_Y = 420;
  const RIVER_HALF = 520;
  const SKYTREE_Y = START_Y - 980;
  const SKYTREE_X = COURSE_X - (RIVER_HALF + 380);
  const MAX_RUDDER = 35;
  const MAX_WHEEL = 540;
  const MAX_SPEED = 9.5;
  const ENDLESS_BEST_KEY = "smallcraft-endless-best-m";
  const TUTORIAL_KEY = "smallcraft-tutorial-done";

  const keys = new Set();
  let running = false;
  let paused = false;
  let finished = false;
  let lastTs = 0;
  let elapsed = 0;
  let dpr = 1;
  let gameMode = "practice"; // "practice" | "endless"
  let failReason = null;
  let distanceM = 0;
  let bestEndlessM = 0;
  let tutorialActive = false;
  let tutorialStep = 0;
  let portraitStartOk = true;
  try {
    bestEndlessM = Number(localStorage.getItem(ENDLESS_BEST_KEY) || 0) || 0;
  } catch (_) {
    bestEndlessM = 0;
  }

  const boat = {
    x: COURSE_X,
    y: START_Y,
    heading: -Math.PI / 2,
    speed: 0,
    rudder: 0,
    targetRudder: 0,
    width: 28,
    length: 56,
  };

  const wake = [];
  const ripples = [];
  const fireworks = [];
  const FW_COLORS = ["#ff6b6b", "#ffd93d", "#6bcbff", "#ff9ff3", "#c8f560", "#ffa94d", "#ffffff"];

  let buoys = [];
  let nextIndex = 0;
  let passes = 0;
  let contacts = 0;
  let wrongSides = 0;
  let widePasses = 0;
  let contacted = new Set();
  let goalCenterOffset = null;
  let bankCrash = false;
  const GOAL_CENTER_GOOD = 40;
  const GOAL_CENTER_OK = 100;
  let bankLandmarks = [];
  let wheelAngle = 0;
  let draggingWheel = false;
  let lastPointerAngle = 0;

  function sideLabel(side) {
    return side === "right" ? "右" : "左";
  }

  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function firstBuoyOffset() {
    return gameMode === "endless" ? ENDLESS_FIRST_BUOY_OFFSET : FIRST_BUOY_OFFSET;
  }

  function sceneryPhaseProgress() {
    if (gameMode !== "endless") return { from: 0, to: 0, t: 0 };
    const u = Math.max(0, (START_Y - firstBuoyOffset() - boat.y) / BUOY_SPACING);
    const boundary = Math.floor(u / SCENERY_EVERY) * SCENERY_EVERY;
    if (boundary > 0 && u < boundary + 1) {
      const to = Math.floor(boundary / SCENERY_EVERY) % 3;
      const from = (to + 2) % 3;
      return { from, to, t: clamp(u - boundary, 0, 1) };
    }
    const phase = Math.floor(u / SCENERY_EVERY) % 3;
    return { from: phase, to: phase, t: 0 };
  }

  function parseColor(c) {
    if (c.startsWith("rgba")) {
      const m = c.match(/rgba?\(([^)]+)\)/);
      const p = m[1].split(",").map((x) => Number(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    const h = c.replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  function formatColor(c) {
    if (c.a < 1) return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(3)})`;
    const hex = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  }

  function lerpColor(a, b, t) {
    const A = parseColor(a);
    const B = parseColor(b);
    return formatColor({
      r: A.r + (B.r - A.r) * t,
      g: A.g + (B.g - A.g) * t,
      b: A.b + (B.b - A.b) * t,
      a: A.a + (B.a - A.a) * t,
    });
  }

  function lerpNum(a, b, t) {
    return a + (b - a) * t;
  }

  function mixTheme(A, B, t) {
    if (t <= 0) return { ...A, sky: [...A.sky], water: [...A.water], landFar: [...A.landFar], crest: [...A.crest], slope: [...A.slope], mud: [...A.mud] };
    if (t >= 1) return { ...B, sky: [...B.sky], water: [...B.water], landFar: [...B.landFar], crest: [...B.crest], slope: [...B.slope], mud: [...B.mud] };
    const soft = t * t * (3 - 2 * t); // smoothstep
    return {
      name: soft < 0.5 ? A.name : B.name,
      sky: A.sky.map((c, i) => lerpColor(c, B.sky[i], soft)),
      water: A.water.map((c, i) => lerpColor(c, B.water[i], soft)),
      haze: lerpColor(A.haze, B.haze, soft),
      landFar: [lerpColor(A.landFar[0], B.landFar[0], soft), lerpColor(A.landFar[1], B.landFar[1], soft)],
      crest: [lerpColor(A.crest[0], B.crest[0], soft), lerpColor(A.crest[1], B.crest[1], soft)],
      slope: [lerpColor(A.slope[0], B.slope[0], soft), lerpColor(A.slope[1], B.slope[1], soft)],
      mud: [lerpColor(A.mud[0], B.mud[0], soft), lerpColor(A.mud[1], B.mud[1], soft)],
      ripple: lerpColor(A.ripple, B.ripple, soft),
      buildingShade: lerpNum(A.buildingShade, B.buildingShade, soft),
      // 夜へ寄ったときだけ窓を点灯（夕方は光らせない）
      windowMode: B.name === "night" && soft > 0.5 ? "night" : A.name === "night" && soft < 0.5 ? "night" : "day",
      stars: lerpNum(A.stars, B.stars, soft),
    };
  }

  function getScenery() {
    const themes = [
      {
        name: "day",
        sky: ["#6bb8e4", "#b7daf3", "#dceaf5"],
        water: ["#3a8fad", "#1f6f90", "#145a78", "#0a3f58"],
        haze: "rgba(70, 85, 100, 0.35)",
        landFar: ["#5f7a52", "#4a6340"],
        crest: ["#9a8b6a", "#7e7256"],
        slope: ["#6f9a55", "#4f7a3c"],
        mud: ["#8b7355", "#6e5a42"],
        ripple: "rgba(220, 245, 255, 0.14)",
        buildingShade: 1,
        windowMode: "day",
        stars: 0,
      },
      {
        name: "evening",
        // 優しいオレンジの夕暮れ（窓は光らせない）
        sky: ["#7a8ec4", "#f0b48a", "#ffe2c4"],
        water: ["#5a8aa8", "#4a7594", "#3a6080", "#2c4e6a"],
        haze: "rgba(210, 150, 110, 0.28)",
        landFar: ["#6a7e58", "#556844"],
        crest: ["#b08a68", "#947456"],
        slope: ["#7a9a5e", "#5f7e48"],
        mud: ["#a88868", "#8a6e52"],
        ripple: "rgba(255, 220, 180, 0.12)",
        buildingShade: 0.92,
        windowMode: "day",
        stars: 0,
      },
      {
        name: "night",
        sky: ["#04060f", "#0a1428", "#152038"],
        water: ["#081520", "#061018", "#040c12", "#02080e"],
        haze: "rgba(25, 35, 55, 0.55)",
        landFar: ["#1e2a1c", "#141c12"],
        crest: ["#3a3428", "#2a261e"],
        slope: ["#243422", "#1a2818"],
        mud: ["#2e2820", "#221e18"],
        ripple: "rgba(120, 170, 210, 0.08)",
        buildingShade: 0.45,
        windowMode: "night",
        stars: 0.9,
      },
    ];
    const { from, to, t } = sceneryPhaseProgress();
    return mixTheme(themes[from], themes[to], t);
  }

  let sceneryCacheKey = "";
  let sceneryCache = null;
  function getSceneryCached() {
    const prog = sceneryPhaseProgress();
    const key =
      gameMode !== "endless"
        ? "practice-day"
        : `${prog.from}:${prog.to}:${Math.floor(prog.t * 12)}`;
    if (sceneryCache && sceneryCacheKey === key) return sceneryCache;
    sceneryCacheKey = key;
    sceneryCache = getScenery();
    return sceneryCache;
  }

  function buildBankLandmarks(yCenter) {
    const center = yCenter == null ? boat.y : yCenter;
    // 見える範囲だけ生成（進んでも配列が増え続けない）
    const ahead = 2800;
    const behind = 1000;
    const yStart = center + behind;
    const yEnd = center - ahead;
    bankLandmarks = [];
    let i = Math.floor(Math.abs(yStart) / 100);
    for (let y = Math.floor(yStart / 100) * 100; y > yEnd; y -= 100) {
      for (const side of [-1, 1]) {
        const r = hash01(i * 17 + side * 9 + y * 0.01);
        const type = r < 0.2 ? "tower" : r < 0.45 ? "factory" : "building";
        const inset = 190 + hash01(i * 3.1 + side) * 120;
        // 左岸スカイツリー付近は通常ビルを抑える
        if (side < 0 && Math.abs(y - SKYTREE_Y) < 160) {
          i += 1;
          continue;
        }
        bankLandmarks.push({
          x: COURSE_X + side * (RIVER_HALF + inset),
          y,
          side,
          type,
          w: type === "tower" ? 16 + r * 12 : 32 + r * 48,
          h: type === "tower" ? 150 + r * 130 : type === "factory" ? 50 + r * 45 : 65 + r * 115,
          tone: 0.35 + hash01(i * 5.7) * 0.45,
        });
        i += 1;
      }
      if (i % 4 === 0) {
        for (const side of [-1, 1]) {
          const r = hash01(i * 23 + side);
          if (side < 0 && Math.abs(y - 45 - SKYTREE_Y) < 160) {
            i += 1;
            continue;
          }
          bankLandmarks.push({
            x: COURSE_X + side * (RIVER_HALF + 280 + r * 140),
            y: y - 45,
            side,
            type: r > 0.65 ? "tower" : "building",
            w: 26 + r * 40,
            h: 55 + r * 105,
            tone: 0.4 + r * 0.35,
          });
          i += 1;
        }
      }
    }

    // 左岸に東京スカイツリー（固定）
    if (SKYTREE_Y < yStart + 200 && SKYTREE_Y > yEnd - 200) {
      bankLandmarks.push({
        x: SKYTREE_X,
        y: SKYTREE_Y,
        side: -1,
        type: "skytree",
        w: 28,
        h: 640,
        tone: 0.9,
      });
    }
  }

  let landmarkRefreshY = START_Y;
  function refreshLandmarksIfNeeded() {
    if (Math.abs(boat.y - landmarkRefreshY) < 500) return;
    landmarkRefreshY = boat.y;
    buildBankLandmarks(boat.y);
  }

  function makeBuoy(index) {
    return {
      index,
      x: COURSE_X,
      y: START_Y - firstBuoyOffset() - index * BUOY_SPACING,
      side: index % 2 === 0 ? "left" : "right",
      passed: false,
      hit: false,
    };
  }

  function buildCourse() {
    buoys = [];
    nextBuoySeq = 0;
    const count = gameMode === "endless" ? ENDLESS_AHEAD : BUOY_COUNT;
    for (let i = 0; i < count; i++) {
      buoys.push(makeBuoy(nextBuoySeq++));
    }
    landmarkRefreshY = START_Y;
    buildBankLandmarks(START_Y);
  }

  function ensureEndlessBuoys() {
    if (gameMode !== "endless" || finished) return;
    if (!Number.isFinite(nextIndex) || nextIndex < 0) nextIndex = 0;
    if (nextIndex > buoys.length) nextIndex = buoys.length;

    // 常に次のブイの先に ENDLESS_AHEAD 本あるように補充（上限キャップで止めない）
    while (buoys.length < nextIndex + ENDLESS_AHEAD) {
      buoys.push(makeBuoy(nextBuoySeq++));
    }

    // 通過済みを整理（1本だけ残す）
    if (nextIndex > 1) {
      const remove = nextIndex - 1;
      buoys.splice(0, remove);
      nextIndex -= remove;
      contacted = new Set();
    }

    // 整理後も必ず前方分を確保
    while (buoys.length < nextIndex + ENDLESS_AHEAD) {
      buoys.push(makeBuoy(nextBuoySeq++));
    }
  }

  function currentDistanceM() {
    return Math.max(0, START_Y - boat.y);
  }

  function endlessKmMarkerDistances() {
    const dist = currentDistanceM();
    const minM = Math.max(
      ENDLESS_KM_EVERY,
      Math.floor((dist - 900) / ENDLESS_KM_EVERY) * ENDLESS_KM_EVERY
    );
    const maxM = Math.ceil((dist + 2600) / ENDLESS_KM_EVERY) * ENDLESS_KM_EVERY;
    const out = [];
    for (let m = minM; m <= maxM; m += ENDLESS_KM_EVERY) {
      out.push(m);
    }
    return out;
  }

  function resetRun(keepOverlay = false) {
    boat.x = COURSE_X;
    boat.y = START_Y;
    boat.heading = -Math.PI / 2;
    boat.speed = 0;
    boat.rudder = 0;
    boat.targetRudder = 0;
    wheelAngle = 0;
    wake.length = 0;
    ripples.length = 0;
    fireworks.length = 0;
    sceneryCacheKey = "";
    sceneryCache = null;
    nextIndex = 0;
    passes = 0;
    contacts = 0;
    wrongSides = 0;
    widePasses = 0;
    contacted = new Set();
    goalCenterOffset = null;
    bankCrash = false;
    failReason = null;
    distanceM = 0;
    elapsed = 0;
    finished = false;
    buildCourse();
    els.throttle.value = "35";
    els.throttleLabel.textContent = "35%";
    updateHud();
    drawWheel();
    if (!keepOverlay) {
      els.resultOverlay.classList.add("hidden");
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    const seaRect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(seaRect.width * dpr));
    canvas.height = Math.max(1, Math.floor(seaRect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mapRect = mapCanvas.getBoundingClientRect();
    mapCanvas.width = Math.max(1, Math.floor(mapRect.width * dpr));
    mapCanvas.height = Math.max(1, Math.floor(mapRect.height * dpr));
    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function wrapPi(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function throttleNorm() {
    return Number(els.throttle.value) / 100;
  }

  function applyInputs(dt) {
    let wheelDelta = 0;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) wheelDelta -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) wheelDelta += 1;
    if (wheelDelta !== 0 && !draggingWheel) {
      wheelAngle = clamp(wheelAngle + wheelDelta * 160 * dt, -MAX_WHEEL, MAX_WHEEL);
    }

    let thr = Number(els.throttle.value);
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) thr += 45 * dt;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) thr -= 45 * dt;
    thr = clamp(thr, 0, 100);
    if (String(Math.round(thr)) !== els.throttle.value) {
      els.throttle.value = String(Math.round(thr));
      els.throttleLabel.textContent = `${Math.round(thr)}%`;
    }

    boat.targetRudder = (wheelAngle / MAX_WHEEL) * MAX_RUDDER;
  }

  function stepPhysics(dt) {
    const targetSpeed = throttleNorm() * MAX_SPEED;
    const accel = boat.speed < targetSpeed ? 2.8 : 4.2;
    boat.speed += (targetSpeed - boat.speed) * Math.min(1, accel * dt);

    const rudderRate = 55;
    boat.rudder += (boat.targetRudder - boat.rudder) * Math.min(1, rudderRate * dt / MAX_RUDDER);

    const speedFactor = clamp(boat.speed / 4.5, 0.15, 1.25);
    const turnRate = (boat.rudder * Math.PI / 180) * 1.55 * speedFactor;
    boat.heading = wrapPi(boat.heading + turnRate * dt);

    const drift = boat.rudder * 0.012 * boat.speed;
    const nx = Math.cos(boat.heading);
    const ny = Math.sin(boat.heading);
    const px = -ny;
    const py = nx;
    boat.x += (nx * boat.speed + px * drift) * 18 * dt;
    boat.y += (ny * boat.speed + py * drift) * 18 * dt;

    if (boat.speed > 0.6) {
      wake.push({
        x: boat.x - nx * 22,
        y: boat.y - ny * 22,
        life: 1,
        heading: boat.heading,
      });
      if (wake.length > 80) wake.shift();
    }
    for (let i = wake.length - 1; i >= 0; i--) {
      wake[i].life -= dt * 0.55;
      if (wake[i].life <= 0) wake.splice(i, 1);
    }

    if (Math.random() < 0.08) {
      ripples.push({
        x: boat.x + (Math.random() - 0.5) * 40,
        y: boat.y + (Math.random() - 0.5) * 40,
        r: 4,
        life: 1,
      });
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].r += 18 * dt;
      ripples[i].life -= dt * 0.7;
      if (ripples[i].life <= 0) ripples.splice(i, 1);
    }
  }

  function boatCorners() {
    const hx = Math.cos(boat.heading);
    const hy = Math.sin(boat.heading);
    const px = -hy;
    const py = hx;
    const hl = boat.length / 2;
    const hw = boat.width / 2;
    return [
      { x: boat.x + hx * hl + px * hw, y: boat.y + hy * hl + py * hw },
      { x: boat.x + hx * hl - px * hw, y: boat.y + hy * hl - py * hw },
      { x: boat.x - hx * hl - px * hw, y: boat.y - hy * hl - py * hw },
      { x: boat.x - hx * hl + px * hw, y: boat.y - hy * hl + py * hw },
    ];
  }

  function pointInBoat(px, py) {
    const c = boatCorners();
    let inside = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const xi = c[i].x;
      const yi = c[i].y;
      const xj = c[j].x;
      const yj = c[j].y;
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function goalY() {
    if (gameMode === "endless") {
      return boat.y - 1200;
    }
    if (!buoys.length) return START_Y;
    return buoys[buoys.length - 1].y - GOAL_AFTER;
  }

  function towerWorldY() {
    if (gameMode === "endless") return boat.y - 1800;
    return goalY() - 1400;
  }

  function checkBankHit() {
    if (finished || bankCrash) return;
    const margin = boat.width * 0.45;
    if (Math.abs(boat.x - COURSE_X) >= RIVER_HALF - margin) {
      bankCrash = true;
      failReason = "bank";
      boat.speed = 0;
      finishRun();
    }
  }

  function checkCourse() {
    if (finished) return;
    ensureEndlessBuoys();

    for (let i = 0; i < buoys.length; i++) {
      const b = buoys[i];
      const dx = boat.x - b.x;
      const dy = boat.y - b.y;
      const dist = Math.hypot(dx, dy);

      if (!contacted.has(i) && (dist < BUOY_RADIUS + 16 || pointInBoat(b.x, b.y))) {
        contacted.add(i);
        b.hit = true;
        contacts += 1;
        if (gameMode === "endless") {
          failReason = "contact";
          boat.speed = 0;
          finishRun();
          return;
        }
      }

      if (!b.passed && nextIndex === i) {
        const crossed = boat.y < b.y;
        if (crossed) {
          const sideOk =
            (b.side === "right" && boat.x > b.x) ||
            (b.side === "left" && boat.x < b.x);
          const lateral = Math.abs(boat.x - b.x);
          b.passed = true;
          nextIndex += 1;

          if (!sideOk) {
            wrongSides += 1;
            if (gameMode === "endless") {
              failReason = "wrong";
              boat.speed = 0;
              finishRun();
              return;
            }
          } else if (lateral > PASS_GATE) {
            widePasses += 1;
            passes += 1;
          } else {
            passes += 1;
          }
          ensureEndlessBuoys();
        }
      }
    }

    checkBankHit();
    if (finished) return;

    if (gameMode === "practice" && nextIndex >= buoys.length && boat.y < goalY()) {
      goalCenterOffset = Math.abs(boat.x - COURSE_X);
      finishRun();
    }
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    running = false;
    paused = false;
    els.pauseOverlay?.classList.add("hidden");
    distanceM = currentDistanceM();
    syncPauseControls();

    if (goalCenterOffset == null) {
      goalCenterOffset = Math.abs(boat.x - COURSE_X);
    }

    if (gameMode === "endless") {
      const isNewBest = distanceM > bestEndlessM;
      if (isNewBest) {
        bestEndlessM = distanceM;
        try {
          localStorage.setItem(ENDLESS_BEST_KEY, String(Math.round(bestEndlessM)));
        } catch (_) {
          /* ignore quota / private mode */
        }
      }

      let title = "記録更新！";
      let eyebrow = "エンドレスコース";
      let lead = "自己ベストを更新しました。もう一度挑戦してみましょう。";
      if (failReason === "bank") {
        title = isNewBest ? "岸接触・記録更新" : "岸に接触";
        eyebrow = "ゲームオーバー";
        lead = isNewBest
          ? "岸にぶつかりましたが、自己ベストを更新しました。"
          : "岸にぶつかりました。中央寄りを保ちながら距離を伸ばしましょう。";
      } else if (failReason === "contact") {
        title = isNewBest ? "接触・記録更新" : "ブイに接触";
        eyebrow = "ゲームオーバー";
        lead = isNewBest
          ? "ブイに触れましたが、自己ベストを更新しました。"
          : "ブイに接触しました。少し離して指定側を通りましょう。";
      } else if (failReason === "wrong") {
        title = isNewBest ? "逆側・記録更新" : "逆側を通過";
        eyebrow = "ゲームオーバー";
        lead = isNewBest
          ? "指定と逆側でしたが、自己ベストを更新しました。"
          : "指定と逆の側を通ってしまいました。次の通過側を先に確認しましょう。";
      } else if (failReason === "quit") {
        title = isNewBest ? "途中終了・記録更新" : "途中終了";
        eyebrow = "エンドレスコース";
        lead = isNewBest
          ? "途中終了でしたが、自己ベストを更新しました。"
          : "プレイを終了しました。自己ベストを目指して再挑戦できます。";
      } else if (!isNewBest) {
        title = "エンドレスコース終了";
        lead = "失敗するまでどこまで進めるかを競うモードです。自己ベストを目指しましょう。";
      }

      els.resultEyebrow.textContent = eyebrow;
      els.resultPanel.classList.add("hero-result");
      els.resultPanel.classList.remove("practice-result");
      els.resultTitle.textContent = `${Math.round(distanceM)} m`;
      els.resultLead.textContent = `${title}。${lead}`;
      if (els.scoreBreakdown) {
        els.scoreBreakdown.textContent = "";
        els.scoreBreakdown.classList.add("hidden");
      }
      els.scoreList.innerHTML = `
        <div><dt>自己ベスト</dt><dd>${Math.round(bestEndlessM)} m</dd></div>
        <div><dt>通過ブイ</dt><dd>${passes} 本</dd></div>
        <div><dt>所要時間</dt><dd>${elapsed.toFixed(1)} 秒</dd></div>
      `;
      els.resultOverlay.classList.remove("hidden");
      updateHud();
      return;
    }

    els.resultPanel.classList.remove("hero-result");
    els.resultPanel.classList.add("practice-result");

    let score = 0;
    let centerRank = "—";
    let title = "コース完了";
    let eyebrow = "結果";
    let lead = "ブイをすべて通過しました。ハンドル操作の感覚を体に覚えさせましょう。";
    let timePenalty = 0;
    let centerPenalty = 0;

    if (bankCrash) {
      score = 0;
      title = "ゲームオーバー";
      eyebrow = "岸に接触";
      lead = "岸にぶつかると0点です。川の中央寄りを意識して操船しましょう。";
      centerRank = "岸接触";
    } else {
      const courseIncomplete = failReason === "quit" && nextIndex < buoys.length;
      let incompletePenalty = 0;

      if (courseIncomplete) {
        // 未通過ブイは大きく減点（0本通過なら0点）
        const missed = Math.max(0, BUOY_COUNT - passes);
        incompletePenalty = missed * 34;
        centerPenalty = 0;
        centerRank = "未到達";
        timePenalty = 0;
      } else {
        timePenalty = Math.max(0, elapsed - 55) * 0.4;
        if (goalCenterOffset <= GOAL_CENTER_GOOD) {
          centerPenalty = 0;
          centerRank = "ほぼ中心";
        } else if (goalCenterOffset <= GOAL_CENTER_OK) {
          centerPenalty =
            ((goalCenterOffset - GOAL_CENTER_GOOD) / (GOAL_CENTER_OK - GOAL_CENTER_GOOD)) * 12;
          centerRank = "やや外側";
        } else {
          centerPenalty = 12 + Math.min(18, (goalCenterOffset - GOAL_CENTER_OK) * 0.12);
          centerRank = "中心から遠い";
        }
      }

      score = Math.max(
        0,
        Math.round(
          100 -
            contacts * 18 -
            wrongSides * 22 -
            widePasses * 8 -
            centerPenalty -
            timePenalty -
            incompletePenalty
        )
      );

      if (
        !courseIncomplete &&
        score >= 85 &&
        contacts === 0 &&
        wrongSides === 0 &&
        goalCenterOffset <= GOAL_CENTER_GOOD
      ) {
        title = "きれいな蛇行です";
        eyebrow = "合格イメージ";
        lead = "指定側の通過ができ、ゴールも中心寄りです。この感覚を維持してください。";
      } else if (wrongSides > 0 || contacts > 1) {
        title = "要練習";
        eyebrow = "見直しポイントあり";
        lead = "逆側通過や接触が目立ちます。速力を落として、次に通る側を先に意識しましょう。";
      } else if (!courseIncomplete && goalCenterOffset > GOAL_CENTER_OK) {
        title = "ゴールを中心へ";
        eyebrow = "直線の締めが課題";
        lead = "蛇行のあとはコース中心へ戻して、まっすぐゴールを抜けましょう。";
      } else if (widePasses > 0) {
        title = "もう少し寄せて";
        eyebrow = "ほぼ良好";
        lead = "通過側は正しいですが、ブイから離れすぎています。舵を早めに戻すと安定します。";
      }

      if (failReason === "quit") {
        title = "途中終了";
        eyebrow = "結果";
        lead = courseIncomplete
          ? "コースの途中で終了しました。未通過のブイは減点になります。"
          : "プレイを終了しました。結果を確認して再挑戦できます。";
      }

      if (els.scoreBreakdown) {
        els.scoreBreakdown.textContent = buildScoreBreakdown(
          timePenalty,
          centerPenalty,
          incompletePenalty
        );
        els.scoreBreakdown.classList.remove("hidden");
      }
    }

    els.resultEyebrow.textContent = eyebrow;
    els.resultTitle.textContent = `${score}`;
    els.resultLead.textContent = `${title}。${lead}`;
    if (bankCrash && els.scoreBreakdown) {
      els.scoreBreakdown.textContent = buildScoreBreakdown(0, 0, 0);
      els.scoreBreakdown.classList.remove("hidden");
    }
    els.scoreList.innerHTML = `
      <div><dt>正しい通過</dt><dd>${passes} / ${BUOY_COUNT}</dd></div>
      <div><dt>接触</dt><dd>${contacts} 回</dd></div>
      <div><dt>逆側通過</dt><dd>${wrongSides} 回</dd></div>
      <div><dt>離れすぎ</dt><dd>${widePasses} 回</dd></div>
      <div><dt>ゴール中心ズレ</dt><dd>${
        bankCrash || (failReason === "quit" && nextIndex < buoys.length)
          ? "—"
          : `${goalCenterOffset.toFixed(0)}（${centerRank}）`
      }</dd></div>
      <div><dt>所要時間</dt><dd>${elapsed.toFixed(1)} 秒</dd></div>
    `;
    els.resultOverlay.classList.remove("hidden");
    updateHud();
  }

  function updateHud() {
    distanceM = currentDistanceM();
    els.speedVal.textContent = boat.speed.toFixed(1);
    els.rudderVal.textContent = String(Math.round(boat.rudder));
    const next = buoys[nextIndex];
    const practiceDone = gameMode === "practice" && nextIndex >= buoys.length;
    els.nextSide.textContent = next ? sideLabel(next.side) : practiceDone ? "直進" : "—";
    els.nextSide.style.color = next
      ? next.side === "right"
        ? "#ff8f7a"
        : "#7ad0ff"
      : practiceDone
        ? "#3ecf8e"
        : "var(--text)";
    els.timeVal.textContent = elapsed.toFixed(1);

    if (gameMode === "endless") {
      els.passHudLabel.textContent = "距離";
      els.passCount.textContent = String(Math.round(distanceM));
      els.passUnit.textContent = "m";
      els.penaltyHudLabel.textContent = "通過";
      els.penaltyCount.textContent = String(passes);
    } else {
      els.passHudLabel.textContent = "通過";
      els.passCount.textContent = `${passes} / ${BUOY_COUNT}`;
      els.passUnit.textContent = "";
      els.penaltyHudLabel.textContent = "減点";
      els.penaltyCount.textContent = String(contacts + wrongSides);
    }
  }

  function toLocal(wx, wy) {
    const dx = wx - boat.x;
    const dy = wy - boat.y;
    const fx = Math.cos(boat.heading);
    const fy = Math.sin(boat.heading);
    const rx = -fy;
    const ry = fx;
    return {
      forward: dx * fx + dy * fy,
      right: dx * rx + dy * ry,
    };
  }

  function makeView(w, h) {
    const bank = (boat.rudder / MAX_RUDDER) * 0.045;
    return {
      w,
      h,
      horizon: h * 0.38,
      focal: Math.max(150, h * 0.48),
      camHeight: 36,
      bank,
      near: 14,
      far: 5000,
    };
  }

  function project(forward, right, view) {
    if (forward < view.near || forward > view.far) return null;
    const scale = view.focal / forward;
    const x = view.w / 2 + right * scale;
    const y = view.horizon + view.camHeight * scale;
    return { x, y, scale, forward };
  }

  function withBank(view, drawFn) {
    ctx.save();
    ctx.translate(view.w / 2, view.horizon);
    ctx.rotate(view.bank);
    ctx.translate(-view.w / 2, -view.horizon);
    drawFn();
    ctx.restore();
  }

  function drawTowerAt(view, p) {
    const h = clamp(520 * p.scale, 18, 340);
    const baseW = clamp(28 * p.scale, 3, 36);
    const topW = clamp(10 * p.scale, 1.5, 14);
    const x = p.x;
    const y = p.y;

    ctx.save();
    ctx.strokeStyle = "rgba(55, 62, 72, 0.92)";
    ctx.fillStyle = "rgba(70, 78, 90, 0.88)";
    ctx.lineWidth = Math.max(1, 1.4 * p.scale);
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(x - baseW, y);
    ctx.lineTo(x - topW, y - h);
    ctx.moveTo(x + baseW, y);
    ctx.lineTo(x + topW, y - h);
    ctx.stroke();

    const levels = 6;
    for (let i = 0; i < levels; i++) {
      const t0 = i / levels;
      const t1 = (i + 1) / levels;
      const y0 = y - h * t0;
      const y1 = y - h * t1;
      const w0 = baseW + (topW - baseW) * t0;
      const w1 = baseW + (topW - baseW) * t1;
      ctx.beginPath();
      ctx.moveTo(x - w0, y0);
      ctx.lineTo(x + w0, y0);
      ctx.moveTo(x - w0, y0);
      ctx.lineTo(x + w1, y1);
      ctx.moveTo(x + w0, y0);
      ctx.lineTo(x - w1, y1);
      ctx.stroke();
    }

    const armY = y - h;
    const armW = clamp(42 * p.scale, 6, 55);
    ctx.lineWidth = Math.max(1.2, 2 * p.scale);
    ctx.beginPath();
    ctx.moveTo(x - armW, armY);
    ctx.lineTo(x + armW, armY);
    ctx.moveTo(x - armW * 0.55, armY - h * 0.06);
    ctx.lineTo(x + armW * 0.55, armY - h * 0.06);
    ctx.stroke();

    ctx.strokeStyle = "rgba(200, 210, 220, 0.75)";
    ctx.lineWidth = Math.max(1, 1.1 * p.scale);
    for (const side of [-1, 1]) {
      for (const ox of [0.7, 1]) {
        const ix = x + side * armW * ox * 0.85;
        ctx.beginPath();
        ctx.moveTo(ix, armY);
        ctx.lineTo(ix, armY + h * 0.12);
        ctx.stroke();
        ctx.fillStyle = "rgba(230, 180, 60, 0.85)";
        ctx.beginPath();
        ctx.arc(ix, armY + h * 0.12, Math.max(1.2, 2.2 * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "rgba(240, 162, 2, 0.95)";
    ctx.beginPath();
    ctx.moveTo(x, armY - h * 0.08);
    ctx.lineTo(x - 3 * p.scale, armY);
    ctx.lineTo(x + 3 * p.scale, armY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawTowerFP(view) {
    withBank(view, () => {
      const loc = toLocal(COURSE_X, towerWorldY());
      if (loc.forward < view.near) return;
      const p = project(loc.forward, loc.right, view);
      if (!p) return;
      drawTowerAt(view, p);
    });
  }

  function drawWaterMarkers(view) {
    withBank(view, () => {
      const markers = [{ y: START_Y + 40, label: "START", color: "rgba(240, 162, 2, 0.85)" }];
      if (gameMode === "practice") {
        markers.push({ y: goalY(), label: "GOAL", color: "rgba(62, 207, 142, 0.9)" });
      } else if (gameMode === "endless") {
        const kmColor = "rgba(62, 207, 142, 0.82)";
        for (const m of endlessKmMarkerDistances()) {
          markers.push({ y: START_Y - m, label: `${m} m`, color: kmColor });
        }
      }
      for (const m of markers) {
        const halfW = m.label === "START" || m.label === "GOAL" ? 110 : 130;
        const left = toLocal(COURSE_X - halfW, m.y);
        const right = toLocal(COURSE_X + halfW, m.y);
        if (left.forward < view.near || right.forward < view.near) continue;
        const pL = project(left.forward, left.right, view);
        const pR = project(right.forward, right.right, view);
        if (!pL || !pR) continue;
        ctx.strokeStyle = m.color;
        ctx.lineWidth = clamp(2.5 * ((pL.scale + pR.scale) / 2), 1.5, 5);
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(pL.x, pL.y);
        ctx.lineTo(pR.x, pR.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        ctx.font = `600 ${Math.max(11, 12 * ((pL.scale + pR.scale) / 2))}px "M PLUS Rounded 1c", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(m.label, (pL.x + pR.x) / 2, (pL.y + pR.y) / 2 - 8);
      }
    });
  }

  function drawBuoysFP(view) {
    const items = buoys
      .map((b, i) => {
        const loc = toLocal(b.x, b.y);
        return { b, i, loc };
      })
      .filter((item) => item.loc.forward > view.near * 0.6)
      .sort((a, b) => b.loc.forward - a.loc.forward);

    withBank(view, () => {
      for (const { b, i, loc } of items) {
        const p = project(loc.forward, loc.right, view);
        if (!p) continue;
        const r = clamp(BUOY_RADIUS * p.scale * 1.15, 4, 64);

        if (i === nextIndex && !finished) {
          const hintX = b.x + (b.side === "right" ? PASS_GATE * 0.55 : -PASS_GATE * 0.55);
          const hint = toLocal(hintX, b.y);
          const hp = project(hint.forward, hint.right, view);
          if (hp) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = b.side === "right" ? "#ff7a66" : "#66c2ff";
            ctx.beginPath();
            ctx.ellipse(hp.x, hp.y, clamp(PASS_GATE * 0.45 * hp.scale, 16, 120), clamp(18 * hp.scale, 8, 40), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = "#f4fbff";
            ctx.font = `700 ${Math.max(13, 15 * hp.scale)}px "M PLUS Rounded 1c", sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(sideLabel(b.side), hp.x, hp.y + 5);
          }
        }

        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + r * 0.2);
        ctx.lineTo(p.x, p.y + r * 1.6);
        ctx.stroke();

        const grd = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.9, r * 0.15, p.x, p.y - r * 0.55, r);
        if (b.hit) {
          grd.addColorStop(0, "#ffd0c8");
          grd.addColorStop(1, "#c44536");
        } else if (b.passed) {
          grd.addColorStop(0, "#d8ffe8");
          grd.addColorStop(1, "#2ea56a");
        } else {
          grd.addColorStop(0, "#ffb4a4");
          grd.addColorStop(1, "#e23b28");
        }
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - r * 0.55, r * 0.85, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = `700 ${Math.max(10, r * 0.7)}px "M PLUS Rounded 1c", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String((b.index ?? i) + 1), p.x, p.y - r * 0.4);
      }
    });
  }

  function drawCockpit(view) {
    const { w, h } = view;
    const deck = ctx.createLinearGradient(0, h * 0.72, 0, h);
    deck.addColorStop(0, "rgba(214, 226, 234, 0)");
    deck.addColorStop(0.25, "rgba(214, 226, 234, 0.55)");
    deck.addColorStop(0.55, "#d7e2ea");
    deck.addColorStop(1, "#9eb0be");
    ctx.fillStyle = deck;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.86);
    ctx.quadraticCurveTo(w * 0.5, h * 0.68, w, h * 0.86);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(30, 55, 72, 0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.86);
    ctx.quadraticCurveTo(w * 0.5, h * 0.68, w, h * 0.86);
    ctx.stroke();

    ctx.fillStyle = "#1e3d52";
    ctx.fillRect(w * 0.35, h * 0.9, w * 0.3, h * 0.08);

    ctx.strokeStyle = "rgba(16, 35, 58, 0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.08, h * 0.08, w * 0.84, h * 0.58);

    if (boat.speed > 1.2) {
      ctx.save();
      ctx.globalAlpha = clamp((boat.speed - 1) / 8, 0.1, 0.35);
      ctx.fillStyle = "#eaf8ff";
      for (let i = 0; i < 10; i++) {
        const sx = w * 0.2 + Math.random() * w * 0.6;
        const sy = h * 0.74 + Math.random() * h * 0.08;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 10 + Math.random() * 16, 3 + Math.random() * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawRiverBanksFP(view) {
    withBank(view, () => {
      const scene = getSceneryCached();
      // 船の周辺だけ（進むほどループが増えない）
      const yTop = boat.y - 1600;
      const yBot = boat.y + 700;
      const step = 48;

      function traceBand(innerX, outerX) {
        const ptsInner = [];
        const ptsOuter = [];
        for (let y = yBot; y >= yTop; y -= step) {
          const li = toLocal(innerX, y);
          const lo = toLocal(outerX, y);
          // 片側だけ欠けるとポリゴンが川の上に食い込むので、同じ y で両方見えるときだけ採用
          if (li.forward < view.near || lo.forward < view.near) continue;
          if (li.forward > view.far && lo.forward > view.far) continue;
          const pi = project(li.forward, li.right, view);
          const po = project(lo.forward, lo.right, view);
          if (!pi || !po) continue;
          ptsInner.push(pi);
          ptsOuter.push(po);
        }
        if (ptsInner.length < 2 || ptsOuter.length < 2) return null;
        return { ptsInner, ptsOuter };
      }

      function fillBand(band, colorA, colorB, extendOuterSide) {
        if (!band) return;
        ctx.beginPath();
        ctx.moveTo(band.ptsInner[0].x, band.ptsInner[0].y);
        for (let i = 1; i < band.ptsInner.length; i++) {
          ctx.lineTo(band.ptsInner[i].x, band.ptsInner[i].y);
        }
        for (let i = band.ptsOuter.length - 1; i >= 0; i--) {
          const p = band.ptsOuter[i];
          const x = extendOuterSide < 0
            ? Math.min(p.x, -view.w)
            : extendOuterSide > 0
              ? Math.max(p.x, view.w * 2)
              : p.x;
          ctx.lineTo(x, p.y);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, view.horizon, 0, view.h);
        g.addColorStop(0, colorA);
        g.addColorStop(1, colorB);
        ctx.fillStyle = g;
        ctx.fill();
      }

      function strokeEdge(xWorld, color, width) {
        ctx.beginPath();
        let started = false;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (let y = yBot; y >= yTop; y -= step) {
          const loc = toLocal(xWorld, y);
          if (loc.forward < view.near) continue;
          const p = project(loc.forward, loc.right, view);
          if (!p) continue;
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else ctx.lineTo(p.x, p.y);
        }
        if (started) ctx.stroke();
      }

      for (const side of [-1, 1]) {
        const waterEdge = COURSE_X + side * RIVER_HALF;
        const mud = COURSE_X + side * (RIVER_HALF + 35);
        const slope = COURSE_X + side * (RIVER_HALF + 120);
        const crest = COURSE_X + side * (RIVER_HALF + 175);
        const outer = COURSE_X + side * (RIVER_HALF + 1400);

        fillBand(traceBand(crest, outer), scene.landFar[0], scene.landFar[1], side);
        fillBand(traceBand(slope, crest), scene.crest[0], scene.crest[1], 0);
        fillBand(traceBand(mud, slope), scene.slope[0], scene.slope[1], 0);
        fillBand(traceBand(waterEdge, mud), scene.mud[0], scene.mud[1], 0);
        strokeEdge(crest - side * 8, "rgba(220, 210, 180, 0.35)", 2);
        strokeEdge(waterEdge, "rgba(180, 200, 160, 0.4)", 2);

        ctx.strokeStyle = "rgba(40, 70, 30, 0.22)";
        ctx.lineWidth = 1;
        for (let y = yBot; y >= yTop; y -= 70) {
          const loc = toLocal(COURSE_X + side * (RIVER_HALF + 70), y);
          if (loc.forward < view.near || loc.forward > view.far) continue;
          const p = project(loc.forward, loc.right, view);
          if (!p) continue;
          const s = clamp(6 * p.scale, 2, 10);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - side * s * 0.4, p.y - s);
          ctx.moveTo(p.x + side * s * 0.15, p.y);
          ctx.lineTo(p.x + side * s * 0.5, p.y - s * 0.75);
          ctx.stroke();
        }
      }

      const items = bankLandmarks
        .map((b) => ({ b, loc: toLocal(b.x, b.y) }))
        .filter((it) => {
          const maxFwd = it.b.type === "skytree" ? Math.min(view.far, 3200) : Math.min(view.far, 1600);
          return it.loc.forward > view.near && it.loc.forward < maxFwd;
        })
        .sort((a, c) => c.loc.forward - a.loc.forward)
        .slice(0, 42);

      for (const { b, loc } of items) {
        const p = project(loc.forward, loc.right, view);
        if (!p) continue;
        const bw = Math.max(4, b.w * p.scale);
        const bh = Math.max(8, b.h * p.scale);
        const x0 = p.x - bw / 2;
        const y0 = p.y - bh;
        const shade = Math.floor((40 + b.tone * 70) * scene.buildingShade);
        const col = `rgb(${shade + 10}, ${shade + 18}, ${shade + 28})`;

        if (b.type === "skytree") {
          drawSkytreeFP(p, bw, bh, scene);
        } else if (b.type === "tower") {
          ctx.strokeStyle = `rgb(${shade + 30}, ${shade + 35}, ${shade + 45})`;
          ctx.lineWidth = Math.max(1.2, 2 * p.scale);
          ctx.beginPath();
          ctx.moveTo(p.x - bw * 0.35, p.y);
          ctx.lineTo(p.x - bw * 0.12, y0);
          ctx.moveTo(p.x + bw * 0.35, p.y);
          ctx.lineTo(p.x + bw * 0.12, y0);
          ctx.moveTo(p.x - bw * 0.2, p.y - bh * 0.45);
          ctx.lineTo(p.x + bw * 0.2, p.y - bh * 0.45);
          ctx.stroke();
          ctx.fillStyle = "#5bc4ef";
          ctx.beginPath();
          ctx.arc(p.x, y0, Math.max(1.5, 2.5 * p.scale), 0, Math.PI * 2);
          ctx.fill();
        } else if (b.type === "factory") {
          ctx.fillStyle = col;
          ctx.fillRect(x0, y0 + bh * 0.25, bw, bh * 0.75);
          ctx.fillStyle = `rgb(${shade - 10}, ${shade}, ${shade + 8})`;
          ctx.fillRect(p.x + bw * 0.15, y0, Math.max(3, bw * 0.18), bh * 0.7);
          ctx.fillStyle = "#c45a3a";
          ctx.fillRect(x0, y0 + bh * 0.22, bw, Math.max(2, 4 * p.scale));
        } else {
          ctx.fillStyle = col;
          ctx.fillRect(x0, y0, bw, bh);
          const rows = Math.max(2, Math.floor(bh / (10 * p.scale + 4)));
          const cols = Math.max(2, Math.floor(bw / (7 * p.scale + 3)));
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const lit =
                scene.windowMode === "night"
                  ? hash01(b.y * 0.01 + r * 3.1 + c * 7.7 + b.side) > 0.38
                  : true;
              if (!lit) continue;
              ctx.fillStyle =
                scene.windowMode === "night"
                  ? "rgba(255, 205, 110, 0.85)"
                  : "rgba(210, 230, 245, 0.35)";
              const wx = x0 + 3 * p.scale + c * (bw / cols);
              const wy = y0 + 4 * p.scale + r * (bh / rows);
              ctx.fillRect(wx, wy, Math.max(1.5, bw / cols - 3 * p.scale), Math.max(1.5, bh / rows - 3 * p.scale));
            }
          }
        }
      }
    });
  }

  function drawSkytreeFP(p, bw, bh, scene) {
    const x = p.x;
    const baseY = p.y;
    const tipY = baseY - bh;
    const night = scene.windowMode === "night";
    // 実寸比に近い配置: 天望デッキ350/634、天望回廊450/634
    const deckT = 350 / 634;
    const galleryT = 450 / 634;
    const bodyTopT = 0.74;
    const deckY = baseY - bh * deckT;
    const galleryY = baseY - bh * galleryT;
    const bodyTopY = baseY - bh * bodyTopT;

    const body = night ? "#c8d7e8" : "#eef7fc";
    const line = night ? "#6f8aaa" : "#5a9ec4";
    const deckFill = night ? "#ffb56a" : "#8ec8e6";

    // 高さ t(0=足元,1=先端) での半幅 — 一本の細い三角
    const halfAt = (t) => {
      if (t <= 0) return bw * 0.55;
      if (t >= bodyTopT) return bw * 0.035;
      return bw * (0.55 - (0.55 - 0.045) * (t / bodyTopT));
    };

    // 本体（連続した細長い三角）
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - halfAt(0), baseY);
    ctx.lineTo(x - halfAt(bodyTopT), bodyTopY);
    ctx.lineTo(x + halfAt(bodyTopT), bodyTopY);
    ctx.lineTo(x + halfAt(0), baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, bw * 0.045);
    ctx.stroke();

    // 中央の縦線
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, bodyTopY);
    ctx.stroke();

    // 菱形格子（本体の中だけ・本数固定）
    ctx.lineWidth = Math.max(0.6, bw * 0.025);
    ctx.globalAlpha = 0.8;
    const steps = 7;
    for (let i = 1; i < steps; i++) {
      const t = (i / steps) * bodyTopT;
      const yy = baseY - bh * t;
      const hw = halfAt(t) * 0.92;
      ctx.beginPath();
      ctx.moveTo(x - hw, yy);
      ctx.lineTo(x + hw, yy);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const t0 = (i / 6) * bodyTopT;
      const t1 = ((i + 1) / 6) * bodyTopT;
      const y0 = baseY - bh * t0;
      const y1 = baseY - bh * t1;
      const w0 = halfAt(t0) * 0.9;
      const w1 = halfAt(t1) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x - w0, y0);
      ctx.lineTo(x + w1, y1);
      ctx.moveTo(x + w0, y0);
      ctx.lineTo(x - w1, y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 天望デッキ（本体よりはっきり張り出す円）
    const localW = halfAt(deckT);
    const deckR = Math.max(localW * 2.1, bw * 0.42);
    ctx.fillStyle = deckFill;
    ctx.beginPath();
    ctx.ellipse(x, deckY, deckR, Math.max(3.5, deckR * 0.55), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.2, bw * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, deckY, deckR * 0.7, Math.max(2, deckR * 0.28), 0, 0, Math.PI * 2);
    ctx.stroke();

    // 天望回廊（小さめ）
    const gR = Math.max(halfAt(galleryT) * 2.4, bw * 0.18);
    ctx.fillStyle = deckFill;
    ctx.beginPath();
    ctx.ellipse(x, galleryY, gR, Math.max(2, gR * 0.45), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 長いアンテナ（全体の約1/4）
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.3, bw * 0.07);
    ctx.beginPath();
    ctx.moveTo(x, bodyTopY);
    ctx.lineTo(x, tipY + bh * 0.02);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, bw * 0.035);
    ctx.beginPath();
    ctx.moveTo(x, tipY + bh * 0.02);
    ctx.lineTo(x, tipY);
    ctx.stroke();
    for (const t of [0.8, 0.88, 0.95]) {
      const yy = baseY - bh * t;
      const hw = bw * 0.06 * (1.1 - t);
      ctx.beginPath();
      ctx.moveTo(x - hw, yy);
      ctx.lineTo(x + hw, yy);
      ctx.stroke();
    }
    ctx.fillStyle = night ? "#ffd27a" : "#5bc4ef";
    ctx.beginPath();
    ctx.arc(x, tipY, Math.max(1.2, bw * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  function updateFireworks(dt, scene, w, horizon) {
    const nightAmt = clamp(scene.stars, 0, 1);
    if (nightAmt < 0.25) {
      fireworks.length = 0;
      return;
    }

    if (fireworks.length < 3 && Math.random() < dt * (0.45 * nightAmt)) {
      const color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      fireworks.push({
        x: w * (0.12 + Math.random() * 0.76),
        y: horizon + 10 + Math.random() * 20,
        ty: 18 + Math.random() * (horizon * 0.55),
        vy: -(220 + Math.random() * 160),
        phase: "rise",
        color,
        particles: null,
      });
    }

    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i];
      if (f.phase === "rise") {
        f.y += f.vy * dt;
        f.vy += 55 * dt;
        if (f.y <= f.ty || f.vy >= -15) {
          f.phase = "burst";
          f.particles = [];
          const n = 18 + Math.floor(Math.random() * 12);
          for (let p = 0; p < n; p++) {
            const a = (Math.PI * 2 * p) / n + Math.random() * 0.25;
            const sp = 50 + Math.random() * 140;
            f.particles.push({
              x: f.x,
              y: f.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp * 0.85,
              life: 0.75 + Math.random() * 0.7,
              age: 0,
              size: 1.4 + Math.random() * 1.8,
            });
          }
        }
      } else {
        let alive = false;
        for (const p of f.particles) {
          p.age += dt;
          if (p.age >= p.life) continue;
          alive = true;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 95 * dt;
          p.vx *= Math.pow(0.985, dt * 60);
        }
        if (!alive) fireworks.splice(i, 1);
      }
    }
  }

  function drawFireworks(scene, horizon) {
    const nightAmt = clamp(scene.stars, 0, 1);
    if (nightAmt < 0.05 || !fireworks.length) return;

    for (const f of fireworks) {
      if (f.phase === "rise") {
        ctx.globalAlpha = 0.9 * nightAmt;
        ctx.fillStyle = "#fff4c8";
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 230, 160, 0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y + 3);
        ctx.lineTo(f.x, f.y + 16);
        ctx.stroke();
      } else if (f.particles) {
        for (const p of f.particles) {
          const a = (1 - p.age / p.life) * nightAmt;
          if (a <= 0.02) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          if (a > 0.35) {
            ctx.globalAlpha = a * 0.35;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function render(dt = 0.016) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const view = makeView(w, h);
    const scene = getSceneryCached();

    ctx.fillStyle = scene.sky[0];
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, view.horizon);
    ctx.rotate(view.bank);
    ctx.translate(-w / 2, -view.horizon);

    const sky = ctx.createLinearGradient(0, 0, 0, view.horizon + 30);
    sky.addColorStop(0, scene.sky[0]);
    sky.addColorStop(0.55, scene.sky[1]);
    sky.addColorStop(1, scene.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(-w, -h, w * 3, view.horizon + h);

    if (scene.stars > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * scene.stars})`;
      for (let i = 0; i < 55; i++) {
        const sx = hash01(i * 19.7 + 3) * (w + 120) - 60;
        const sy = hash01(i * 7.3 + 11) * (view.horizon - 8);
        const sr = hash01(i * 3.1) > 0.82 ? 1.6 : 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    updateFireworks(dt, scene, w, view.horizon);

    // distant city haze on horizon
    ctx.fillStyle = scene.haze;
    for (let i = 0; i < 18; i++) {
      const bx = (i / 18) * (w + 80) - 40;
      const bh = 8 + ((i * 37) % 22);
      ctx.fillRect(bx, view.horizon - bh, 10 + (i % 4) * 4, bh + 2);
      if (scene.windowMode !== "day") {
        ctx.fillStyle = scene.windowMode === "night" ? "rgba(255, 200, 100, 0.55)" : "rgba(255, 170, 80, 0.35)";
        for (let n = 0; n < 3; n++) {
          if (hash01(i * 5 + n) < 0.45) continue;
          ctx.fillRect(bx + 2 + n * 3, view.horizon - bh + 2 + n * 3, 1.5, 1.5);
        }
        ctx.fillStyle = scene.haze;
      }
    }

    drawFireworks(scene, view.horizon);

    // river water under horizon
    const river = ctx.createLinearGradient(0, view.horizon, 0, h + 100);
    river.addColorStop(0, scene.water[0]);
    river.addColorStop(0.3, scene.water[1]);
    river.addColorStop(0.7, scene.water[2]);
    river.addColorStop(1, scene.water[3]);
    ctx.fillStyle = river;
    ctx.fillRect(-w, view.horizon, w * 3, h + 140);

    ctx.strokeStyle = scene.ripple;
    ctx.lineWidth = 1.4;
    for (let d = 45; d < 1700; d += 70) {
      const pL = project(d, -RIVER_HALF * 0.92, view);
      const pR = project(d, RIVER_HALF * 0.92, view);
      if (!pL || !pR) continue;
      ctx.globalAlpha = clamp(1 - d / 1700, 0.04, 0.22);
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    const yMin = boat.y - 1400;
    const yMax = boat.y + 400;
    for (let worldY = yMax; worldY >= yMin; worldY -= 40) {
      const loc = toLocal(COURSE_X, worldY);
      if (loc.forward < view.near) continue;
      const p = project(loc.forward, loc.right, view);
      if (!p) continue;
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    drawRiverBanksFP(view);
    drawWaterMarkers(view);
    if (gameMode === "practice") {
      const towerFwd = toLocal(COURSE_X, towerWorldY()).forward;
      const buoyMaxFwd = buoys.reduce((m, b) => Math.max(m, toLocal(b.x, b.y).forward), -Infinity);
      if (towerFwd >= buoyMaxFwd) {
        drawTowerFP(view);
        drawBuoysFP(view);
      } else {
        drawBuoysFP(view);
        drawTowerFP(view);
      }
    } else {
      drawBuoysFP(view);
    }
    drawCockpit(view);
  }

  function renderMap() {
    const w = mapCanvas.clientWidth;
    const h = mapCanvas.clientHeight;
    if (w < 2 || h < 2) return;

    const zoom = Math.min(0.55, Math.max(0.28, Math.min(w, h) / 1100));
    const lookAhead = (h * 0.28) / zoom;
    const camX = boat.x;
    const camY = boat.y - lookAhead;

    const toScreen = (x, y) => ({
      x: (x - camX) * zoom + w / 2,
      y: (y - camY) * zoom + h / 2,
    });

    const scene = getSceneryCached();
    const g = mapCtx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, scene.water[1]);
    g.addColorStop(0.5, scene.water[2]);
    g.addColorStop(1, scene.water[3]);
    mapCtx.fillStyle = g;
    mapCtx.fillRect(0, 0, w, h);

    // banks (土手)
    const leftBank = toScreen(COURSE_X - RIVER_HALF, camY);
    const rightBank = toScreen(COURSE_X + RIVER_HALF, camY);
    const leftCrest = toScreen(COURSE_X - RIVER_HALF - 160, camY);
    const rightCrest = toScreen(COURSE_X + RIVER_HALF + 160, camY);
    mapCtx.fillStyle = "#5a7a48";
    mapCtx.fillRect(0, 0, leftBank.x, h);
    mapCtx.fillRect(rightBank.x, 0, w - rightBank.x, h);
    // slope
    mapCtx.fillStyle = "#6f9a55";
    mapCtx.fillRect(leftCrest.x, 0, leftBank.x - leftCrest.x, h);
    mapCtx.fillRect(rightBank.x, 0, rightCrest.x - rightBank.x, h);
    // crest path
    mapCtx.fillStyle = "#9a8b6a";
    mapCtx.fillRect(leftCrest.x - 6 * zoom, 0, 8 * zoom, h);
    mapCtx.fillRect(rightCrest.x - 2 * zoom, 0, 8 * zoom, h);
    // waterline
    mapCtx.fillStyle = "#8b7355";
    mapCtx.fillRect(leftBank.x - 5 * zoom, 0, 5 * zoom, h);
    mapCtx.fillRect(rightBank.x, 0, 5 * zoom, h);

    mapCtx.save();
    mapCtx.globalAlpha = 0.14;
    mapCtx.strokeStyle = "#9fe7ff";
    mapCtx.lineWidth = 1;
    const spacing = 48 * zoom;
    const ox = -((camX * zoom) % spacing);
    const oy = -((camY * zoom) % spacing);
    for (let x = ox - spacing; x < w + spacing; x += spacing) {
      mapCtx.beginPath();
      mapCtx.moveTo(x, 0);
      mapCtx.lineTo(x, h);
      mapCtx.stroke();
    }
    for (let y = oy - spacing; y < h + spacing; y += spacing) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, y);
      mapCtx.lineTo(w, y);
      mapCtx.stroke();
    }
    mapCtx.restore();

    // course line（画面付近だけ）
    const laneTop = toScreen(COURSE_X, boat.y - 900);
    const laneBot = toScreen(COURSE_X, boat.y + 200);
    mapCtx.setLineDash([8, 10]);
    mapCtx.strokeStyle = "rgba(255,255,255,0.28)";
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(laneTop.x, laneTop.y);
    mapCtx.lineTo(laneBot.x, laneBot.y);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // start / goal
    const drawLineMarker = (worldY, color, label) => {
      const a = toScreen(COURSE_X - 100, worldY);
      const b = toScreen(COURSE_X + 100, worldY);
      mapCtx.strokeStyle = color;
      mapCtx.lineWidth = 2.5;
      mapCtx.setLineDash([6, 6]);
      mapCtx.beginPath();
      mapCtx.moveTo(a.x, a.y);
      mapCtx.lineTo(b.x, b.y);
      mapCtx.stroke();
      mapCtx.setLineDash([]);
      mapCtx.fillStyle = color;
      mapCtx.font = '600 11px "M PLUS Rounded 1c", sans-serif';
      mapCtx.textAlign = "center";
      mapCtx.fillText(label, (a.x + b.x) / 2, a.y - 6);
    };
    drawLineMarker(START_Y + 40, "rgba(240, 162, 2, 0.9)", "START");
    if (gameMode === "practice") {
      drawLineMarker(goalY(), "rgba(62, 207, 142, 0.9)", "GOAL");
    } else if (gameMode === "endless") {
      const kmColor = "rgba(62, 207, 142, 0.85)";
      for (const m of endlessKmMarkerDistances()) {
        drawLineMarker(START_Y - m, kmColor, `${m} m`);
      }
    }

    // tower mark
    if (gameMode === "practice") {
      const tw = toScreen(COURSE_X, towerWorldY());
      mapCtx.fillStyle = "rgba(180, 190, 200, 0.85)";
      mapCtx.beginPath();
      mapCtx.moveTo(tw.x, tw.y - 18);
      mapCtx.lineTo(tw.x - 6, tw.y);
      mapCtx.lineTo(tw.x + 6, tw.y);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.fillStyle = "rgba(240, 162, 2, 0.85)";
      mapCtx.beginPath();
      mapCtx.arc(tw.x, tw.y - 20, 2.5, 0, Math.PI * 2);
      mapCtx.fill();
    }

    // buoys
    buoys.forEach((b, i) => {
      const s = toScreen(b.x, b.y);
      const r = Math.max(5, BUOY_RADIUS * zoom);

      if (i === nextIndex && !finished) {
        const hx = b.side === "right" ? PASS_GATE * 0.55 : -PASS_GATE * 0.55;
        const hs = toScreen(b.x + hx, b.y);
        mapCtx.globalAlpha = 0.22;
        mapCtx.fillStyle = b.side === "right" ? "#ff7a66" : "#66c2ff";
        mapCtx.beginPath();
        mapCtx.ellipse(hs.x, hs.y, Math.max(12, PASS_GATE * 0.45 * zoom), Math.max(8, 22 * zoom), 0, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.globalAlpha = 1;
        mapCtx.fillStyle = "#f4fbff";
        mapCtx.font = '700 11px "M PLUS Rounded 1c", sans-serif';
        mapCtx.textAlign = "center";
        mapCtx.fillText(sideLabel(b.side), hs.x, hs.y + 3);
      }

      const grd = mapCtx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, r * 0.2, s.x, s.y, r);
      if (b.hit) {
        grd.addColorStop(0, "#ffd0c8");
        grd.addColorStop(1, "#c44536");
      } else if (b.passed) {
        grd.addColorStop(0, "#d8ffe8");
        grd.addColorStop(1, "#2ea56a");
      } else {
        grd.addColorStop(0, "#ffb4a4");
        grd.addColorStop(1, "#e23b28");
      }
      mapCtx.fillStyle = grd;
      mapCtx.beginPath();
      mapCtx.arc(s.x, s.y, r, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = "rgba(255,255,255,0.55)";
      mapCtx.lineWidth = 1.5;
      mapCtx.stroke();
      mapCtx.fillStyle = "#fff";
      mapCtx.font = '700 10px "M PLUS Rounded 1c", sans-serif';
      mapCtx.textAlign = "center";
      mapCtx.fillText(String((b.index ?? i) + 1), s.x, s.y + 3);
    });

    // boat
    const bs = toScreen(boat.x, boat.y);
    mapCtx.save();
    mapCtx.translate(bs.x, bs.y);
    mapCtx.rotate(boat.heading);
    const L = boat.length * zoom * 1.1;
    const W = boat.width * zoom * 1.1;
    const hull = mapCtx.createLinearGradient(-L * 0.4, 0, L * 0.45, 0);
    hull.addColorStop(0, "#d9e2ea");
    hull.addColorStop(0.55, "#f7fbff");
    hull.addColorStop(1, "#f0a202");
    mapCtx.fillStyle = hull;
    mapCtx.beginPath();
    mapCtx.moveTo(L * 0.48, 0);
    mapCtx.quadraticCurveTo(L * 0.2, W * 0.58, -L * 0.42, W * 0.42);
    mapCtx.lineTo(-L * 0.42, -W * 0.42);
    mapCtx.quadraticCurveTo(L * 0.2, -W * 0.58, L * 0.48, 0);
    mapCtx.fill();
    mapCtx.fillStyle = "#1e3d52";
    mapCtx.fillRect(-L * 0.16, -W * 0.2, L * 0.26, W * 0.4);
    mapCtx.restore();
  }

  function drawWheel() {
    const size = wheelCanvas.width;
    const c = size / 2;
    const r = size * 0.4;
    const rimW = size * 0.085;
    wheelCtx.clearRect(0, 0, size, size);

    wheelCtx.save();
    wheelCtx.translate(c, c);
    wheelCtx.rotate((wheelAngle * Math.PI) / 180);

    // soft shadow
    wheelCtx.beginPath();
    wheelCtx.arc(5, 10, r + rimW * 0.15, 0, Math.PI * 2);
    wheelCtx.fillStyle = "rgba(20, 40, 60, 0.22)";
    wheelCtx.fill();

    // outer rim (thick white plastic ring)
    const rimGrad = wheelCtx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r + rimW);
    rimGrad.addColorStop(0, "#ffffff");
    rimGrad.addColorStop(0.45, "#f4f6f8");
    rimGrad.addColorStop(0.82, "#e4e8ec");
    rimGrad.addColorStop(1, "#cfd6dc");
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r + rimW * 0.15, 0, Math.PI * 2);
    wheelCtx.arc(0, 0, r - rimW, 0, Math.PI * 2, true);
    wheelCtx.fillStyle = rimGrad;
    wheelCtx.fill();

    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r + rimW * 0.05, 0, Math.PI * 2);
    wheelCtx.strokeStyle = "rgba(255,255,255,0.95)";
    wheelCtx.lineWidth = 3;
    wheelCtx.stroke();
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r - rimW + 1, 0, Math.PI * 2);
    wheelCtx.strokeStyle = "rgba(180, 190, 200, 0.55)";
    wheelCtx.lineWidth = 2;
    wheelCtx.stroke();

    // three thick spokes: down, up-left, up-right
    const spokeAngles = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3];
    const spokeInner = size * 0.07;
    const spokeOuter = r - rimW * 0.35;
    const spokeHalf = size * 0.055;

    for (const a of spokeAngles) {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const px = -sin;
      const py = cos;
      const x0 = cos * spokeInner;
      const y0 = sin * spokeInner;
      const x1 = cos * spokeOuter;
      const y1 = sin * spokeOuter;

      wheelCtx.beginPath();
      wheelCtx.moveTo(x0 + px * spokeHalf * 0.65, y0 + py * spokeHalf * 0.65);
      wheelCtx.lineTo(x1 + px * spokeHalf, y1 + py * spokeHalf);
      wheelCtx.arc(x1, y1, spokeHalf, a + Math.PI / 2, a - Math.PI / 2, true);
      wheelCtx.lineTo(x0 - px * spokeHalf * 0.65, y0 - py * spokeHalf * 0.65);
      wheelCtx.closePath();

      const sg = wheelCtx.createLinearGradient(
        x0 + px * spokeHalf,
        y0 + py * spokeHalf,
        x0 - px * spokeHalf,
        y0 - py * spokeHalf
      );
      sg.addColorStop(0, "#dfe4e9");
      sg.addColorStop(0.4, "#ffffff");
      sg.addColorStop(1, "#cfd6dc");
      wheelCtx.fillStyle = sg;
      wheelCtx.fill();
      wheelCtx.strokeStyle = "rgba(190, 198, 206, 0.7)";
      wheelCtx.lineWidth = 1.5;
      wheelCtx.stroke();
    }

    // center hub
    const hubR = size * 0.125;
    const hubGrad = wheelCtx.createRadialGradient(-hubR * 0.3, -hubR * 0.35, 2, 0, 0, hubR);
    hubGrad.addColorStop(0, "#ffffff");
    hubGrad.addColorStop(0.7, "#f0f3f6");
    hubGrad.addColorStop(1, "#d8dee4");
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, hubR, 0, Math.PI * 2);
    wheelCtx.fillStyle = hubGrad;
    wheelCtx.fill();

    // cyan accent ring
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, hubR * 0.72, 0, Math.PI * 2);
    wheelCtx.strokeStyle = "#5bc4ef";
    wheelCtx.lineWidth = Math.max(4, size * 0.012);
    wheelCtx.stroke();
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, hubR * 0.72, 0, Math.PI * 2);
    wheelCtx.strokeStyle = "rgba(255,255,255,0.55)";
    wheelCtx.lineWidth = Math.max(1.5, size * 0.004);
    wheelCtx.stroke();

    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, hubR * 0.55, 0, Math.PI * 2);
    wheelCtx.fillStyle = "#eef2f5";
    wheelCtx.fill();

    // top alignment mark
    wheelCtx.fillStyle = "#5bc4ef";
    wheelCtx.beginPath();
    wheelCtx.moveTo(0, -r - rimW * 0.05);
    wheelCtx.lineTo(7, -r + rimW * 0.55);
    wheelCtx.lineTo(-7, -r + rimW * 0.55);
    wheelCtx.closePath();
    wheelCtx.fill();

    // gloss highlight
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r - rimW * 0.35, -Math.PI * 0.95, -Math.PI * 0.55);
    wheelCtx.strokeStyle = "rgba(255,255,255,0.65)";
    wheelCtx.lineWidth = rimW * 0.45;
    wheelCtx.lineCap = "round";
    wheelCtx.stroke();
    wheelCtx.lineCap = "butt";

    wheelCtx.restore();
  }

  function pointerAngle(e) {
    const rect = wheelWrap.getBoundingClientRect();
    const x = (e.clientX ?? e.touches[0].clientX) - rect.left - rect.width / 2;
    const y = (e.clientY ?? e.touches[0].clientY) - rect.top - rect.height / 2;
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  function onWheelDown(e) {
    if (paused || finished || tutorialActive) return;
    e.preventDefault();
    draggingWheel = true;
    wheelWrap.classList.add("dragging");
    lastPointerAngle = pointerAngle(e);
  }

  function onWheelMove(e) {
    if (!draggingWheel) return;
    e.preventDefault();
    const ang = pointerAngle(e);
    let delta = ang - lastPointerAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    wheelAngle = clamp(wheelAngle + delta * 1.35, -MAX_WHEEL, MAX_WHEEL);
    lastPointerAngle = ang;
    boat.targetRudder = (wheelAngle / MAX_WHEEL) * MAX_RUDDER;
    drawWheel();
  }

  function onWheelUp() {
    draggingWheel = false;
    wheelWrap.classList.remove("dragging");
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;

    if (running && !finished) {
      applyInputs(dt);
      stepPhysics(dt);
      try {
        checkCourse();
      } catch (err) {
        console.error(err);
      }
      refreshLandmarksIfNeeded();
      elapsed += dt;
      updateHud();
      drawWheel();
    } else if (!paused) {
      applyInputs(dt);
      drawWheel();
    } else {
      drawWheel();
    }

    try {
      render(dt);
      renderMap();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  function buildScoreBreakdown(timePenalty, centerPenalty, incompletePenalty = 0) {
    if (bankCrash) return "減点の内訳：岸接触のため総合点は 0 点です。";
    const parts = [];
    if (incompletePenalty >= 0.5) {
      const missed = Math.max(0, BUOY_COUNT - passes);
      parts.push(`未通過×${missed} −${Math.round(incompletePenalty)}`);
    }
    if (contacts > 0) parts.push(`接触×${contacts} −${contacts * 18}`);
    if (wrongSides > 0) parts.push(`逆側×${wrongSides} −${wrongSides * 22}`);
    if (widePasses > 0) parts.push(`離れすぎ×${widePasses} −${widePasses * 8}`);
    if (centerPenalty >= 0.5) parts.push(`ゴール外側 −${Math.round(centerPenalty)}`);
    if (timePenalty >= 0.5) parts.push(`時間 −${Math.round(timePenalty)}`);
    if (!parts.length) return "減点の内訳：なし（満点に近い走りです）。";
    return `減点の内訳：${parts.join("、")}。`;
  }

  function tutorialSeen() {
    try {
      return localStorage.getItem(TUTORIAL_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markTutorialSeen() {
    try {
      localStorage.setItem(TUTORIAL_KEY, "1");
    } catch (_) {
      /* ignore */
    }
  }

  const TUTORIAL_STEPS = [
    {
      title: "次は左（または右）",
      body: "上の「次の通過」を見てください。ブイはその側を通ります。左右交互に進みます。",
      target: () => els.nextSide?.closest(".hud-item") || els.nextSide,
    },
    {
      title: "ハンドルをここ",
      body: "右の白いハンドルをドラッグして操舵します。PCなら ← → キーでも回せます。",
      target: () => wheelWrap,
    },
    {
      title: "準備OK",
      body: "スロットルで速力を変えられます。最初はゆっくりで、ブイの指定側を通りましょう。",
      target: () => els.throttle?.closest(".throttle-block") || els.throttle,
    },
  ];

  function placeTutorialSpotlight(el) {
    const spot = els.tutorialSpotlight;
    if (!spot || !el) {
      if (spot) spot.style.opacity = "0";
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 10;
    spot.style.opacity = "1";
    spot.style.left = `${Math.max(4, r.left - pad)}px`;
    spot.style.top = `${Math.max(4, r.top - pad)}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;
  }

  function placeTutorialCard(el) {
    const card = els.tutorialOverlay?.querySelector(".tutorial-card");
    if (!card) return;
    card.style.left = "";
    card.style.top = "";
    card.style.right = "";
    card.style.bottom = "";
    card.style.transform = "";

    if (!el) {
      card.style.left = "50%";
      card.style.top = "50%";
      card.style.transform = "translate(-50%, -50%)";
      return;
    }

    const r = el.getBoundingClientRect();
    const cardW = Math.min(320, window.innerWidth - 24);
    const preferBelow = r.bottom + 160 < window.innerHeight;
    let left = clamp(r.left + r.width / 2 - cardW / 2, 12, window.innerWidth - cardW - 12);
    card.style.width = `${cardW}px`;
    card.style.left = `${left}px`;
    if (preferBelow) {
      card.style.top = `${Math.min(window.innerHeight - 140, r.bottom + 14)}px`;
    } else {
      card.style.top = `${Math.max(12, r.top - 150)}px`;
    }
  }

  function showTutorialStep() {
    const step = TUTORIAL_STEPS[tutorialStep];
    if (!step || !els.tutorialOverlay) return;
    els.tutorialOverlay.classList.remove("hidden");
    els.tutorialStepLabel.textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
    els.tutorialTitle.textContent = step.title;
    els.tutorialBody.textContent = step.body;
    els.tutorialNextBtn.textContent =
      tutorialStep >= TUTORIAL_STEPS.length - 1 ? "はじめる" : "次へ";
    const target = step.target();
    requestAnimationFrame(() => {
      placeTutorialSpotlight(target);
      placeTutorialCard(target);
    });
  }

  function beginTutorial() {
    tutorialActive = true;
    tutorialStep = 0;
    running = false;
    showTutorialStep();
  }

  function advanceTutorial() {
    if (!tutorialActive) return;
    tutorialStep += 1;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
      endTutorial();
      return;
    }
    showTutorialStep();
  }

  function endTutorial() {
    tutorialActive = false;
    markTutorialSeen();
    if (els.tutorialOverlay) els.tutorialOverlay.classList.add("hidden");
    if (els.tutorialSpotlight) els.tutorialSpotlight.style.opacity = "0";
    running = true;
    lastTs = 0;
    syncPauseControls();
  }

  function hideTutorial() {
    tutorialActive = false;
    if (els.tutorialOverlay) els.tutorialOverlay.classList.add("hidden");
    if (els.tutorialSpotlight) els.tutorialSpotlight.style.opacity = "0";
  }

  function syncLandscapeRequirement() {
    document.body.classList.toggle("landscape-required", !portraitStartOk);
  }

  function showStartIntro() {
    portraitStartOk = true;
    syncLandscapeRequirement();
    els.startIntroPanel?.classList.remove("hidden");
    els.startModePanel?.classList.add("hidden");
  }

  function showStartMode() {
    portraitStartOk = false;
    syncLandscapeRequirement();
    els.startIntroPanel?.classList.add("hidden");
    els.startModePanel?.classList.remove("hidden");
  }

  function openStartOverlay(phase = "intro") {
    els.startOverlay.classList.remove("hidden");
    if (phase === "mode") showStartMode();
    else showStartIntro();
  }

  function startGame(mode) {
    if (mode === "practice" || mode === "endless") gameMode = mode;
    portraitStartOk = false;
    syncLandscapeRequirement();
    hideTutorial();
    paused = false;
    els.pauseOverlay?.classList.add("hidden");
    resetRun();
    resize();
    els.startOverlay.classList.add("hidden");
    els.resultOverlay.classList.add("hidden");
    lastTs = 0;
    if (!tutorialSeen()) {
      beginTutorial();
    } else {
      running = true;
    }
    syncPauseControls();
  }

  function syncPauseControls() {
    const showPause =
      !finished &&
      !paused &&
      !tutorialActive &&
      els.startOverlay.classList.contains("hidden") &&
      els.resultOverlay.classList.contains("hidden");
    els.pauseBtn?.classList.toggle("hidden", !showPause);
    els.pauseBtn?.closest(".helm-actions")?.classList.toggle("has-pause", showPause);
    if (paused) {
      els.pauseOverlay?.classList.remove("hidden");
    } else {
      els.pauseOverlay?.classList.add("hidden");
    }
  }

  function pauseGame() {
    if (!running || finished || paused || tutorialActive) return;
    if (!els.startOverlay.classList.contains("hidden")) return;
    paused = true;
    running = false;
    draggingWheel = false;
    wheelWrap.classList.remove("dragging");
    if (els.pauseEyebrow) {
      els.pauseEyebrow.textContent =
        gameMode === "endless" ? "エンドレスコース" : "３ブイコース";
    }
    if (els.pauseLead) {
      els.pauseLead.textContent =
        gameMode === "endless"
          ? `現在 ${Math.round(currentDistanceM())} m。再開するか、ここで終了できます。`
          : "再開するか、ここで終了できます。";
    }
    syncPauseControls();
  }

  function resumeGame() {
    if (!paused || finished) return;
    paused = false;
    running = true;
    lastTs = 0;
    syncPauseControls();
  }

  function endFromPause() {
    if (!paused || finished) return;
    endCurrentPlay();
  }

  function isActivelyPlaying() {
    return (
      !finished &&
      !tutorialActive &&
      els.startOverlay.classList.contains("hidden") &&
      els.resultOverlay.classList.contains("hidden") &&
      (running || paused)
    );
  }

  function endCurrentPlay() {
    if (!isActivelyPlaying()) {
      goHome("intro");
      return;
    }
    paused = false;
    els.pauseOverlay?.classList.add("hidden");
    failReason = "quit";
    finishRun();
    syncPauseControls();
  }

  function goHome(phase = "intro") {
    hideTutorial();
    paused = false;
    els.pauseOverlay?.classList.add("hidden");
    resetRun(true);
    running = false;
    finished = false;
    els.resultOverlay.classList.add("hidden");
    portraitStartOk = phase === "intro";
    openStartOverlay(phase);
    syncLandscapeRequirement();
    updateHud();
    syncPauseControls();
    drawWheel();
    render();
    renderMap();
  }

  // events
  window.addEventListener("resize", () => {
    resize();
    render();
    renderMap();
    if (tutorialActive) showTutorialStep();
  });
  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      resize();
      render();
      renderMap();
      if (tutorialActive) showTutorialStep();
    }, 120);
  });

  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === "Escape") {
      if (paused) {
        e.preventDefault();
        resumeGame();
      } else if (running && !finished && !tutorialActive) {
        e.preventDefault();
        pauseGame();
      }
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  els.throttle.addEventListener("input", () => {
    els.throttleLabel.textContent = `${els.throttle.value}%`;
  });

  els.playStartBtn.addEventListener("click", showStartMode);
  els.startBackBtn.addEventListener("click", showStartIntro);
  els.startPracticeBtn.addEventListener("click", () => startGame("practice"));
  els.startEndlessBtn.addEventListener("click", () => startGame("endless"));
  els.retryBtn.addEventListener("click", () => startGame(gameMode));
  els.changeCourseBtn.addEventListener("click", () => goHome("mode"));
  els.resultEndBtn.addEventListener("click", () => goHome("intro"));
  els.endBtn.addEventListener("click", endCurrentPlay);
  els.pauseBtn?.addEventListener("click", pauseGame);
  els.resumeBtn?.addEventListener("click", resumeGame);
  els.pauseEndBtn?.addEventListener("click", endFromPause);
  els.tutorialNextBtn.addEventListener("click", advanceTutorial);
  els.resetBtn.addEventListener("click", () => {
    const onStartScreen = !els.startOverlay.classList.contains("hidden");
    paused = false;
    els.pauseOverlay?.classList.add("hidden");
    resetRun();
    if (onStartScreen) {
      running = false;
      syncPauseControls();
      return;
    }
    els.resultOverlay.classList.add("hidden");
    running = true;
    lastTs = 0;
    syncPauseControls();
  });

  wheelWrap.addEventListener("pointerdown", onWheelDown);
  window.addEventListener("pointermove", onWheelMove);
  window.addEventListener("pointerup", onWheelUp);
  window.addEventListener("pointercancel", onWheelUp);

  buildCourse();
  resize();
  resetRun(true);
  showStartIntro();
  syncLandscapeRequirement();
  drawWheel();
  render();
  renderMap();
  requestAnimationFrame(loop);
})();
