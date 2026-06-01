const $id = (id) => document.getElementById(id);

const expvalHistoryLength = 60;
const graphHistoryLength = 60;
const historyLength = Math.max(expvalHistoryLength, graphHistoryLength);
const totalGraphSteps = 500;

// "\u2212": MINUS SIGN
// "\u2014": EM DASH
const format = (value) =>
  Number.isFinite(value) ? value.toFixed(3).replace("-", "\u2212") : "\u2014";

// Shape of an arrow
const arrowPath = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

class Model {
  constructor() {
    this.setUpControl();

    // this.sigmas[this.states[this.Nx * y + x]]: sigma on (x, y)
    this.sigmas = [];

    // this.states[this.Nx * y + x]: State on (x, y)
    this.states = [];

    // Store most recent values here.
    // The newest entry is on the index 0.
    // The oldest entry is on the index expvalHistoryLength - 1.
    this.EHistory = new Array(historyLength);
    this.MHistory = new Array(historyLength);
    this.CHistory = new Array(historyLength);
    this.chiHistory = new Array(historyLength);

    // Store graph data here.
    this.TGraph = [];
    this.EGraph = [];
    this.MAbsGraph = [];
    this.CGraph = [];
    this.chiGraph = [];

    this.sigmaDrawer = new SigmaDrawer(this);
    this.canvasDrawer = new CanvasDrawer(this);
    this.graphDrawer = new GraphDrawer(this);

    this.resetToDefault();

    this.TSaved = this.T;
    this.requestId = undefined;
    this.timeoutId = undefined;
    this.runOneFrame();
  }

  setUpControl() {
    for (const [id, numberMin, rangeMin, rangeMax, eraseHistory] of [
      ["speed", 0, 0, 1, false],
      ["T", 0, 0, 5, true],
      ["J1", null, -1, 1, false],
      ["J2", null, -1, 1, false],
      ["J3", null, -1, 1, false],
      ["J4", null, -1, 1, false],
      ["J0", null, -1, 1, false],
      ["h", null, -2, 2, false],
    ]) {
      const number = document.querySelector(`#${id} > input[type="number"]`);
      if (numberMin !== null) {
        number.min = numberMin;
      }
      number.step = 0.01;

      const range = $id(id).querySelector(`#${id} > input[type="range"]`);
      range.min = rangeMin;
      range.max = rangeMax;
      range.step = 0.01;

      number.addEventListener("input", () => {
        this[id] = number.valueAsNumber;
        range.value = number.valueAsNumber;
        if (eraseHistory) {
          this.eraseHistory();
        }
      });
      range.addEventListener("input", () => {
        this[id] = range.valueAsNumber;
        number.value = range.valueAsNumber;
        if (eraseHistory) {
          this.eraseHistory();
        }
      });
    }

    for (const id of ["Nx", "Ny"]) {
      $id(id).min = 1;
      $id(id).addEventListener("input", () => {
        const value = $id(id).valueAsNumber;
        if (!Number.isFinite(value) || value < 1) {
          return;
        }

        this[id] = $id(id).valueAsNumber;
        this.states.length = this.Nx * this.Ny;
        this.randomizeStates();
        this.calculateStat();
        this.drawStat();
        this.canvasDrawer.configure();
        this.canvasDrawer.draw();
      });
    }

    for (const elem of document.querySelectorAll('input[type="radio"]')) {
      elem.addEventListener("input", () => {
        this.doOneMonteCarloStep = {
          metropolis: this.doOneMetropolisStep,
          "heat-bath": this.doOneHeatBathStep,
        }[elem.value];
      });
    }

    $id("reset").addEventListener("click", () => {
      this.resetToDefault();
    });

    $id("enter").addEventListener("click", () => {
      $id("enter").style.display = "none";
      $id("leave").style.display = "";
      $id("graph-container").style.display = "";
      $id("canvas").style.filter = "blur(0.5rem)";
      $id("canvas").style.opacity = "10%";

      cancelAnimationFrame(this.requestId);

      for (const elem of document.querySelectorAll(
        "#control input, #control button:not(#leave)",
      )) {
        elem.style.pointerEvents = "none";
      }
      this.TSaved = this.T;
      document.querySelector('#speed > input[type="number"]').value = "";
      document.querySelector('#speed > input[type="range"]').value =
        document.querySelector('#speed > input[type="range"]').max;

      this.TGraph.length = 0;
      this.EGraph.length = 0;
      this.MAbsGraph.length = 0;
      this.CGraph.length = 0;
      this.chiGraph.length = 0;

      // Before start cooling the system
      // let the system to be in thermal equibrium.
      this.randomizeStates();
      for (let i = 0; i < 600 * this.Nx * this.Ny; i++) {
        this.doOneMonteCarloStep();
        if (i % (this.Nx * this.Ny) === 0) {
          this.calculateStat();
        }
      }

      this.graphStep = totalGraphSteps;
      this.runOneGraphStep();
    });
    $id("leave").addEventListener("click", () => {
      $id("enter").style.display = "";
      $id("leave").style.display = "none";
      $id("graph-container").style.display = "none";
      $id("canvas").style.filter = "";
      $id("canvas").style.opacity = "";

      clearTimeout(this.timeoutId);

      for (const elem of document.querySelectorAll(
        "#control input, #control button",
      )) {
        elem.style.pointerEvents = "";
      }
      this.T = this.TSaved;
      for (const elem of document.querySelectorAll("#speed > input")) {
        elem.value = this.speed.toFixed(2).replace(/\.?0*$/, "");
      }
      for (const elem of document.querySelectorAll("#T > input")) {
        elem.value = this.T.toFixed(2).replace(/\.?0*$/, "");
      }

      this.runOneFrame();
    });

    $id("randomize").addEventListener("click", () => {
      this.randomizeStates();
      this.calculateStat();
      this.drawStat();
      this.canvasDrawer.draw();
    });

    $id("add").addEventListener("click", () => {
      this.sigmas.push(0);
      this.sigmaDrawer.configure();
      this.sigmaDrawer.draw();

      $id("remove").disabled = false;
      this.randomizeStates();
      this.calculateStat();
      this.drawStat();
      this.canvasDrawer.configure();
      this.canvasDrawer.draw();
    });
    $id("remove").addEventListener("click", () => {
      if (this.sigmas.length <= 2) {
        return;
      }

      this.sigmas.pop();
      this.sigmaDrawer.configure();
      this.sigmaDrawer.draw();

      $id("remove").disabled = this.sigmas.length <= 2;
      this.randomizeStates();
      this.calculateStat();
      this.drawStat();
      this.canvasDrawer.configure();
      this.canvasDrawer.draw();
    });
  }

  resetToDefault() {
    for (const [id, defaultValue] of [
      ["speed", 1],
      ["T", 2.27],
      ["J1", 1],
      ["J2", 1],
      ["J3", 0],
      ["J4", 0],
      ["J0", 0],
      ["h", 0],
    ]) {
      this[id] = defaultValue;
      for (const elem of document.querySelectorAll(`#${id} > input`)) {
        elem.value = defaultValue;
      }
    }

    for (const [id, defaultValue] of [
      ["Nx", 20],
      ["Ny", 20],
    ]) {
      this[id] = defaultValue;
      $id(id).value = defaultValue;
    }

    {
      const elem = document.querySelector(
        "#algorithm-container > :first-child > input",
      );
      this.doOneMonteCarloStep = this.doOneMetropolisStep;
      elem.checked = true;
    }

    this.sigmas.splice(0, this.sigmas.length, 1, -1);
    this.states.length = this.Nx * this.Ny;
    this.randomizeStates();

    this.sigmaDrawer.configure();
    this.sigmaDrawer.draw();
    this.canvasDrawer.configure();
    this.canvasDrawer.draw();
    this.graphDrawer.configure();
  }

  sigma(x, y) {
    // Get sigma with taking the periodic boundary condition into account.

    // For example, -11 % 10 is -1 in JavaScript.
    x = ((x % this.Nx) + this.Nx) % this.Nx;
    y = ((y % this.Ny) + this.Ny) % this.Ny;

    return this.sigmas[this.states[this.Nx * y + x]];
  }

  eraseHistory() {
    this.EHistory.fill(undefined);
    this.MHistory.fill(undefined);
    this.CHistory.fill(undefined);
    this.chiHistory.fill(undefined);
  }

  randomizeStates() {
    for (const [i] of this.states.entries()) {
      this.states[i] = Math.floor(2 * Math.random());
    }
    this.eraseHistory();
  }

  calculateStat() {
    let E = 0;
    let M = 0;
    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {
        E -=
          (this.J1 * this.sigma(x + 1, y) +
            this.J2 * this.sigma(x, y + 1) +
            this.J3 * this.sigma(x + 1, y + 1) +
            this.J4 * this.sigma(x - 1, y + 1) +
            this.J0 * this.sigma(x, y) +
            this.h) *
          this.sigma(x, y);
        M += this.sigma(x, y);
      }
    }

    // Expected values are calculated (approximated)
    // by averaging expvalHistoryLength most recent values.
    let EExpval = 0;
    let E2Expval = 0;
    let MExpval = 0;
    let M2Expval = 0;
    for (let i = 0; i < expvalHistoryLength; i++) {
      EExpval += this.EHistory[i];
      E2Expval += this.EHistory[i] ** 2;
      MExpval += this.MHistory[i];
      M2Expval += this.MHistory[i] ** 2;
    }
    EExpval /= expvalHistoryLength;
    E2Expval /= expvalHistoryLength;
    MExpval /= expvalHistoryLength;
    M2Expval /= expvalHistoryLength;
    const C = (E2Expval - EExpval ** 2) / this.T ** 2;
    const chi = (M2Expval - MExpval ** 2) / this.T;

    this.EHistory.pop();
    this.EHistory.unshift(E);
    this.MHistory.pop();
    this.MHistory.unshift(M);
    this.CHistory.pop();
    this.CHistory.unshift(C);
    this.chiHistory.pop();
    this.chiHistory.unshift(chi);
  }

  drawStat() {
    $id("E").innerText = format(this.EHistory[0] / (this.Nx * this.Ny));
    $id("M").innerText = format(this.MHistory[0] / (this.Nx * this.Ny));
    $id("C").innerText = format(this.CHistory[0] / (this.Nx * this.Ny));
    $id("chi").innerText = format(this.chiHistory[0] / (this.Nx * this.Ny));
  }

  doOneMetropolisStep() {
    // Select a cell.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    // Get current state and sigma of the cell.
    const stateCurr = this.states[this.Nx * y + x];
    const sigmaCurr = this.sigmas[stateCurr];

    // Propose a new state and sigma for the cell.
    // The new state must be different to the current one.
    const stateProp =
      (Math.floor(Math.random() * (this.sigmas.length - 1)) + stateCurr + 1) %
      this.sigmas.length;
    const sigmaProp = this.sigmas[stateProp];

    // Calculate EProp - ECurr, where:
    // - EProp = energy of the system when the proposal is accepted
    // - ECurr = current energy of the system
    // You don't have to calculate EProp and ECurr directly
    // since only the cell and its neighbors contribute to the difference.
    const EDifference =
      -(
        this.J1 * (this.sigma(x + 1, y) + this.sigma(x - 1, y)) +
        this.J2 * (this.sigma(x, y + 1) + this.sigma(x, y - 1)) +
        this.J3 * (this.sigma(x + 1, y + 1) + this.sigma(x - 1, y - 1)) +
        this.J4 * (this.sigma(x - 1, y + 1) + this.sigma(x + 1, y - 1)) +
        this.J0 * (sigmaProp + sigmaCurr) +
        this.h
      ) *
      (sigmaProp - sigmaCurr);

    if (EDifference < 0) {
      // Always accept the proposal if it's energetically advantageous.
      this.states[this.Nx * y + x] = stateProp;
    } else {
      // Accept the proposal according to the acceptance probability.
      if (this.T > 0) {
        if (Math.random() < Math.exp(-EDifference / this.T)) {
          this.states[this.Nx * y + x] = stateProp;
        }
      }
    }
  }

  doOneHeatBathStep() {
    if (this.T <= 0) {
      return;
    }

    // Select a cell.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    // Calculate Baltzmann factors.
    const factors = [];
    let factorSum = 0;
    for (const sigma of this.sigmas) {
      const ERelevant =
        -(
          this.J1 * (this.sigma(x + 1, y) + this.sigma(x - 1, y)) +
          this.J2 * (this.sigma(x, y + 1) + this.sigma(x, y - 1)) +
          this.J3 * (this.sigma(x + 1, y + 1) + this.sigma(x - 1, y - 1)) +
          this.J4 * (this.sigma(x - 1, y + 1) + this.sigma(x + 1, y - 1)) +
          this.J0 * sigma +
          this.h
        ) * sigma;
      const factor = Math.exp(-ERelevant / this.T);
      factors.push(factor);
      factorSum += factor;
    }

    // Select a new state.
    const random = Math.random() * factorSum;
    let accum = 0;
    let state;
    for (const [i, factor] of factors.entries()) {
      if (random >= accum && random < accum + factor) {
        state = i;
        break;
      }
      accum += factor;
    }

    this.states[this.Nx * y + x] = state;
  }

  runOneFrame() {
    // this.speed = Number of Monte Carlo steps / N / animation frame
    for (let i = 0; i < this.speed * this.Nx * this.Ny; i++) {
      this.doOneMonteCarloStep();
    }
    this.calculateStat();
    this.drawStat();
    this.canvasDrawer.draw();
    this.requestId = requestAnimationFrame(() => this.runOneFrame());
  }

  runOneGraphStep() {
    for (let i = 0; i < graphHistoryLength * this.Nx * this.Ny; i++) {
      this.doOneMonteCarloStep();
      if (i % (this.Nx * this.Ny) === 0) {
        this.calculateStat();
      }
    }
    this.canvasDrawer.draw();

    // The Y-axis values on the graph are calculated
    // by averaging graphHistoryLength most recent values.
    let E = 0;
    let M = 0;
    let MAbs = 0;
    let C = 0;
    let chi = 0;
    for (let i = 0; i < graphHistoryLength; i++) {
      E += this.EHistory[i];
      M += this.MHistory[i];
      MAbs += Math.abs(this.MHistory[i]);
      C += this.CHistory[i];
      chi += this.chiHistory[i];
    }
    E /= graphHistoryLength * this.Nx * this.Ny;
    M /= graphHistoryLength * this.Nx * this.Ny;
    MAbs /= graphHistoryLength * this.Nx * this.Ny;
    C /= graphHistoryLength * this.Nx * this.Ny;
    chi /= graphHistoryLength * this.Nx * this.Ny;

    this.TGraph.push(this.T);
    this.EGraph.push(E);
    this.MAbsGraph.push(MAbs);
    this.CGraph.push(C);
    this.chiGraph.push(chi);
    this.graphDrawer.draw();

    for (const elem of document.querySelectorAll("#T > input")) {
      elem.value = this.T.toFixed(2).replace(/\.?0*$/, "");
    }
    $id("E").innerText = format(E);
    $id("M").innerText = format(M);
    $id("C").innerText = format(C);
    $id("chi").innerText = format(chi);

    if (--this.graphStep >= 0) {
      this.T = (this.TSaved * this.graphStep) / totalGraphSteps;
      this.timeoutId = setTimeout(() => this.runOneGraphStep());
    }
  }
}

function getPredrawnCanvases(sigmas, zoom) {
  // Pre-draw arrows to improve performance.

  const lightnessMin = 10;
  const lightnessMax = 90;
  const lightnessRange = lightnessMax - lightnessMin;
  const lightnessMiddle = (lightnessMin + lightnessMax) / 2;

  const sigmaMin = Math.min(...sigmas);
  const sigmaMax = Math.max(...sigmas);
  const sigmaRange = sigmaMax - sigmaMin;
  const sigmaAbsMax = Math.max(Math.abs(sigmaMax), Math.abs(sigmaMin));

  const canvases = [];
  for (const sigma of sigmas) {
    const canvas = new OffscreenCanvas(zoom, zoom);
    const context = canvas.getContext("2d", { transparent: false });

    // Draw background.
    const backgroundLightness =
      ((sigma - sigmaMin) / sigmaRange) * lightnessRange + lightnessMin;
    context.fillStyle = `oklch(${backgroundLightness}% 0% 0deg)`;
    context.fillRect(0, 0, zoom, zoom);

    // Draw an arrow.
    if (zoom >= 8 * window.devicePixelRatio && sigma !== 0) {
      const transformedArrowPath = new Path2D();
      transformedArrowPath.addPath(arrowPath, {
        a: zoom / 16,
        d: ((sigma / sigmaAbsMax) * zoom) / 16,
        e: zoom / 2,
        f: zoom / 2,
      });
      const arrowLightness =
        backgroundLightness < lightnessMiddle
          ? backgroundLightness + lightnessRange / 2
          : backgroundLightness - lightnessRange / 2;
      context.fillStyle = `oklch(${arrowLightness}% 0% 0deg)`;
      context.fill(transformedArrowPath);
      context.lineWidth = zoom / 16;
      context.lineJoin = "round";
      context.strokeStyle = `oklch(${arrowLightness}% 0% 0deg)`;
      context.stroke(transformedArrowPath);
    }

    canvases.push(canvas);
  }
  return canvases;
}

class SigmaDrawer {
  constructor(model) {
    this.model = model;

    // Watch for changes on window.devicePixelRatio.
    window
      .matchMedia("(min-resolution: 2dppx)")
      .addEventListener("change", () => {
        this.draw();
      });
  }

  configure() {
    for (const div of document.querySelectorAll(".sigma")) {
      div.remove();
    }

    for (const [i, sigma] of this.model.sigmas.entries()) {
      const canvas = document.createElement("canvas");

      const number = document.createElement("input");
      number.type = "number";
      number.step = "0.01";
      number.value = `${sigma}`;

      const range = document.createElement("input");
      range.type = "range";
      range.min = "-2";
      range.max = "2";
      range.step = "0.01";
      range.value = `${sigma}`;

      const div = document.createElement("div");
      div.classList.add("sigma");
      div.classList.add("slider");
      div.append(canvas);
      div.append(number);
      div.append(range);
      $id("sigma-container").insertBefore(div, $id("sigma-button"));

      number.addEventListener("input", () => {
        range.value = number.valueAsNumber;
        this.model.sigmas[i] = number.valueAsNumber;
        this.draw();
        this.model.canvasDrawer.configure();
        this.model.canvasDrawer.draw();
      });
      range.addEventListener("input", () => {
        number.value = range.valueAsNumber;
        this.model.sigmas[i] = range.valueAsNumber;
        this.draw();
        this.model.canvasDrawer.configure();
        this.model.canvasDrawer.draw();
      });
    }
  }

  draw() {
    const zoom = 32 * window.devicePixelRatio;
    const canvases = getPredrawnCanvases(this.model.sigmas, zoom);

    for (const [i, canvas] of document
      .querySelectorAll(".sigma > canvas")
      .entries()) {
      canvas.width = zoom;
      canvas.height = zoom;
      canvas.getContext("2d").drawImage(canvases[i], 0, 0);
    }
  }
}

class CanvasDrawer {
  constructor(model) {
    this.model = model;
    this.context = $id("canvas").getContext("2d", { alpha: false });

    // Watch for changes on window.devicePixelRatio.
    window
      .matchMedia("(min-resolution: 2dppx)")
      .addEventListener("change", () => {
        this.configure();
        this.draw();
      });

    new ResizeObserver(() => {
      this.configure();
      this.draw();
    }).observe($id("canvas-container"));
  }

  configure() {
    const dpr = window.devicePixelRatio;
    this.zoom = Math.min(
      Math.max(
        Math.floor(
          Math.min(
            ($id("canvas-container").offsetWidth / this.model.Nx) * dpr,
            ($id("canvas-container").offsetHeight / this.model.Ny) * dpr,
          ),
        ),
        1,
      ),
      32 * dpr,
    );

    $id("canvas").style.width = `${(this.model.Nx * this.zoom) / dpr}px`;
    $id("canvas").style.height = `${(this.model.Ny * this.zoom) / dpr}px`;
    $id("canvas").width = this.model.Nx * this.zoom;
    $id("canvas").height = this.model.Ny * this.zoom;

    this.canvases = getPredrawnCanvases(this.model.sigmas, this.zoom);
  }

  draw() {
    for (let y = 0; y < this.model.Ny; y++) {
      for (let x = 0; x < this.model.Nx; x++) {
        this.context.drawImage(
          this.canvases[this.model.states[this.model.Nx * y + x]],
          x * this.zoom,
          y * this.zoom,
        );
      }
    }
  }
}

class GraphDrawer {
  constructor(model) {
    this.model = model;

    this.EContext = $id("E-canvas").getContext("2d");
    this.MAbsContex = $id("MAbs-canvas").getContext("2d");
    this.CContext = $id("C-canvas").getContext("2d");
    this.chiContext = $id("chi-canvas").getContext("2d");

    // Watch for changes on window.devicePixelRatio.
    window
      .matchMedia("(min-resolution: 2dppx)")
      .addEventListener("change", () => {
        this.configure();
        this.draw();
      });
  }

  configure() {
    // Canvas pixel per 1rem.
    this.rem = 16 * window.devicePixelRatio;

    // X and Y are in canvas coordinates.
    // Do not confuse them with x and y.
    this.XLeft = 1 * this.rem;
    this.XRight = 11 * this.rem;
    this.YTop = 1 * this.rem;
    this.YBottom = 11 * this.rem;

    for (const canvas of [
      $id("E-canvas"),
      $id("MAbs-canvas"),
      $id("C-canvas"),
      $id("chi-canvas"),
    ]) {
      canvas.width = 12 * this.rem;
      canvas.height = 12 * this.rem;
    }

    // Pre-draw gridlines.
    {
      this.gridlineCanvas = new OffscreenCanvas(12 * this.rem, 12 * this.rem);
      const context = this.gridlineCanvas.getContext("2d", {
        transparent: false,
      });
      context.strokeStyle = "oklch(90% 0% 0deg)";
      context.lineCap = "square";
      context.lineWidth = this.rem / 16;

      // Draw vertical lines.
      for (let i = 0; i <= 5; i++) {
        const X = this.XLeft + ((this.XRight - this.XLeft) * i) / 5;
        context.beginPath();
        context.moveTo(X, this.YTop);
        context.lineTo(X, this.YBottom);
        context.stroke();
      }

      // Draw horizontal lines.
      for (let i = 0; i <= 5; i++) {
        const Y = this.YBottom - ((this.YBottom - this.YTop) * i) / 5;
        context.beginPath();
        context.moveTo(this.XLeft, Y);
        context.lineTo(this.XRight, Y);
        context.stroke();
      }
    }
  }

  draw() {
    const [, TMax, TTicks] = this.getVisibleRangeOfAxis(0, this.model.TSaved);

    for (const [graph, context, isAlwaysPositive] of [
      [this.model.EGraph, this.EContext, false],
      [this.model.MAbsGraph, this.MAbsContex, true],
      [this.model.CGraph, this.CContext, true],
      [this.model.chiGraph, this.chiContext, true],
    ]) {
      const min0 = isAlwaysPositive
        ? 0
        : Math.min(...graph.filter((value) => Number.isFinite(value)));
      const max0 = Math.max(...graph.filter((value) => Number.isFinite(value)));
      const [min, max, ticks] = this.getVisibleRangeOfAxis(min0, max0);

      // Erase the canvas.
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);

      // Draw gridlines.
      context.drawImage(this.gridlineCanvas, 0, 0);

      // Draw X labels.
      for (let i = 0; i <= 5; i++) {
        const X = this.XLeft + ((this.XRight - this.XLeft) * i) / 5;

        context.font = `${this.rem / 2}px system-ui`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        context.fillStyle = "oklch(90% 0% 0deg)";
        context.fillText(TTicks[i], X, this.YBottom + this.rem / 2);
      }

      // Draw Y labels.
      for (let i = 0; i <= 5; i++) {
        const Y = this.YBottom - ((this.YBottom - this.YTop) * i) / 5;

        context.font = `${this.rem / 2}px system-ui`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        context.save();
        context.translate(this.XLeft - this.rem / 2, Y);
        context.rotate(-Math.PI / 2);
        context.fillStyle = "oklch(90% 0% 0deg)";
        context.fillText(ticks[i], 0, 0);
        context.restore();
      }

      // Draw points.
      for (const [i, T] of this.model.TGraph.entries()) {
        if (!Number.isFinite(graph[i])) {
          continue;
        }

        const X = this.XLeft + (T / TMax) * (this.XRight - this.XLeft);
        const Y =
          this.YBottom -
          ((graph[i] - min) / (max - min)) * (this.YBottom - this.YTop);

        context.beginPath();
        context.ellipse(X, Y, this.rem / 16, this.rem / 16, 0, 0, 2 * Math.PI);
        context.fillStyle = "black";
        context.fill();
      }
    }
  }

  getVisibleRangeOfAxis(min0, max0) {
    // Get an appropriate visible range for the Y axis.
    // I have the following criteria.
    // - All points are visible.
    // - The span of the visible range is snapped to one of:
    //   10e-3, 2.5e-2, 5e-2, 10e-2, 2.5e-1, 5e-1, 10e-1, 2.5e0, 5e0, 10e0, ...
    // - Each tick (the six horizontal lines) is snapped to
    //   a multiple of span / 5.

    let spn0 = max0 - min0;
    let exp0 = Math.ceil(Math.log10(spn0)) - 1; /* Exponent */
    let sig0 = spn0 / 10 ** exp0; /* Significand */
    if (exp0 <= -3) {
      exp0 = -3;
      sig0 = 10;
    }

    let min;
    let max;
    let exp;
    let sig;
    for (const [exp1, sig1, exp2, sig2] of [
      [exp0, 2.5, exp0, 5],
      [exp0, 5, exp0, 10],
      [exp0, 10, exp0 + 1, 2.5],
    ]) {
      if (sig0 <= sig1) {
        let inc1 = (sig1 * 10 ** exp1) / 5; /* Increment */
        let min1 = Math.floor(min0 / inc1) * inc1;
        let max1 = min1 + sig1 * 10 ** exp1;

        if (max0 <= max1) {
          min = min1;
          max = max1;
          exp = exp1;
          sig = sig1;
        } else {
          let inc2 = (sig2 * 10 ** exp2) / 5;
          let min2 = Math.floor(min0 / inc2) * inc2;
          let max2 = min2 + sig2 * 10 ** exp2;

          min = min2;
          max = max2;
          exp = exp2;
          sig = sig2;
        }
        break;
      }
    }

    // Use toFixed(12) to prevent a float arithmetic error to be displayed.
    const ticks = [];
    for (let i = 0; i <= 5; i++) {
      ticks.push(
        ((sig * 10 ** exp * i) / 5 + min)
          .toFixed(12)
          .replace(/\.?0*$/, "")
          .replace("-", "\u2212"),
      );
    }

    return [min, max, ticks];
  }
}

new Model();
