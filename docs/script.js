const $id = id => document.getElementById(id);

// Expected values are calculated
// by averaging expvalHistoryLength most recent values.
const expvalHistoryLength = 60;

// The y-axis values on the graph are calculated
// by averaging graphHistoryLength most recent values.
const graphHistoryLength = 30;

const historyLength = Math.max(expvalHistoryLength, graphHistoryLength);

const graphLength = 120;
console.assert(graphLength >= expvalHistoryLength + graphHistoryLength);

const TPerGraphStep = 0.01;

// "\u2212": MINUS SIGN
// "\u2014": EM DASH
const format = (value) => (
  isFinite(value) ? value.toFixed(3).replace("-", "\u2212") : "\u2014"
);

// Shape of an arrow
const arrowPath = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

class Model {
  constructor() {
    this.setUpControl();

    // this.sigmas[this.states[this.Nx * y + x]]: sigma on (x, y)
    this.sigmas = [1, -1];

    // this.states[this.Nx * y + x]: State on (x, y)
    this.states = new Array(this.Nx * this.Ny);

    // Store most recent values here.
    // The newest entry is on the index 0.
    // The oldest entry is on the index expvalHistoryLength - 1.
    this.EHistory   = new Array(historyLength);
    this.MHistory   = new Array(historyLength);
    this.CHistory   = new Array(historyLength);
    this.chiHistory = new Array(historyLength);

    // Store graph data here.
    this.TGraph   = [];
    this.EGraph   = [];
    this.MGraph   = [];
    this.CGraph   = [];
    this.chiGraph = [];

    this.randomizeStates();
    this.sigmaDrawer = new SigmaDrawer(this);
    this.canvasDrawer = new CanvasDrawer(this);
    this.graphDrawer = new GraphDrawer(this);

    this.TSaved = this.T;
    this.requestId = undefined;
    this.timeoutId = undefined;
    this.runOneFrame();
  }

  setUpControl() {
    for (const [
      id, numberMin, rangeMin, rangeMax, initialValue, eraseHistory
    ] of [
      ["speed", 0,     0,  1, 1, false],
      ["T",     0,     0, 10, 2, true ],
      ["J1",    null, -1,  1, 1, false],
      ["J2",    null, -1,  1, 1, false],
      ["J3",    null, -1,  1, 0, false],
      ["J4",    null, -1,  1, 0, false],
      ["J0",    null, -1,  1, 0, false],
      ["h",     null, -2,  2, 0, false],
    ]) {
      this[id] = initialValue;
      
      const number = document.querySelector(`#${id} > input[type="number"]`);
      if (numberMin !== null) {
        number.min = numberMin;
      }
      number.step = 0.01;
      number.value = initialValue;
      
      const range = $id(id).querySelector(`#${id} > input[type="range"]`);
      range.min = rangeMin;
      range.max = rangeMax;
      range.step = 0.01;
      range.value = initialValue;

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

    for (const [id, initialValue] of [["Nx", 50], ["Ny", 50]]) {
      this[id] = initialValue;
      $id(id).min = 1;
      $id(id).value = initialValue;
      $id(id).addEventListener("input", () => {
        this[id] = $id(id).valueAsNumber;
        this.states.length = this.Nx * this.Ny;
        this.randomizeStates();
        this.calculateStat();
        this.drawStat();
        this.canvasDrawer.configure();
        this.canvasDrawer.draw();
      });
    }

    $id("resume").addEventListener("click", () => {
      $id("pause").style.display = "";
      $id("resume").style.display = "none";
      this.runOneFrame();
    });
    $id("pause").addEventListener("click", () => {
      $id("pause").style.display = "none";
      $id("resume").style.display = "";
      cancelAnimationFrame(this.requestId);
    });
    $id("continue").addEventListener("click", (event) => {
      $id("continue").disabled = true;
      this.graphStep++;
      this.runOneGraphStep();
    });
    $id("enter").addEventListener("click", (event) => {
      $id("resume").style.display = "none";
      $id("pause").style.display = "none";
      $id("continue").style.display = "";
      $id("continue").disabled = true;
      $id("enter").style.display = "none";
      $id("leave").style.display = "";
      $id("graph-container").style.display = "";
      $id("canvas").style.filter = "blur(0.5rem)";
      $id("canvas").style.opacity = "10%";

      cancelAnimationFrame(this.requestId);

      for (const elem of document.querySelectorAll(
        "#control input, #control button:not(#continue):not(#leave)"
      )) {
        elem.style.pointerEvents = "none";
      }
      this.TSaved = this.T;
      document.querySelector('#speed > input[type="number"]').value = "";
      document.querySelector('#speed > input[type="range"]').value = (
        document.querySelector('#speed > input[type="range"]').max
      );

      this.TGraph.length = 0;
      this.EGraph.length = 0;
      this.MGraph.length = 0;
      this.CGraph.length = 0;
      this.chiGraph.length = 0;

      this.graphStep = 1;
      this.T = TPerGraphStep;
      this.resetStates();
      this.runOneGraphStep();
    });
    $id("leave").addEventListener("click", (event) => {
      $id("resume").style.display = "none";
      $id("pause").style.display = "";
      $id("continue").style.display = "none";
      $id("continue").disabled = false;
      $id("enter").style.display = "";
      $id("leave").style.display = "none";
      $id("graph-container").style.display = "none";
      $id("canvas").style.filter = "";
      $id("canvas").style.opacity = "";

      clearTimeout(this.timeoutId);

      for (const elem of document.querySelectorAll(
        "#control input, #control button"
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

    $id("reset").addEventListener("click", () => {
      this.resetStates()
      this.calculateStat();
      this.drawStat();
      this.canvasDrawer.draw();
    });
    $id("randomize").addEventListener("click", () => {
      this.randomizeStates();
      this.calculateStat();
      this.drawStat();
      this.canvasDrawer.draw();
    });

    $id("add").addEventListener("click", (event) => {
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
    $id("remove").addEventListener("click", (event) => {
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

  sigma(x, y) {
    // Get sigma with taking the periodic boundary condition into account.

    // For example, -11 % 10 is -1 in JavaScript.
    x = ((x % this.Nx) + this.Nx) % this.Nx;
    y = ((y % this.Ny) + this.Ny) % this.Ny;

    return this.sigmas[this.states[this.Nx * y + x]];
  }

  eraseHistory() {
    this.EHistory  .fill(undefined);
    this.MHistory  .fill(undefined);
    this.CHistory  .fill(undefined);
    this.chiHistory.fill(undefined);
  }

  resetStates() {
    this.states.fill(0);
    this.eraseHistory();
  }

  randomizeStates() {
    for (const [i, ] of this.states.entries()) {
      this.states[i] = Math.floor(2 * Math.random());
    }
    this.eraseHistory();
  }

  calculateStat() {
    let E = 0;
    let M = 0;
    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {
        E += (
          - this.J1 * this.sigma(x + 1, y    )
          - this.J2 * this.sigma(x,     y + 1)
          - this.J3 * this.sigma(x + 1, y + 1)
          - this.J4 * this.sigma(x - 1, y + 1)
          - this.J0 * this.sigma(x,     y    )
          - this.h
        ) * this.sigma(x, y);
        M += this.sigma(x, y);
      }
    }

    let EExpval  = 0;
    let E2Expval = 0;
    let MExpval  = 0;
    let M2Expval = 0;
    for (let i = 0; i < expvalHistoryLength; i++) {
      EExpval  += this.EHistory[i];
      E2Expval += this.EHistory[i] ** 2;
      MExpval  += this.MHistory[i];
      M2Expval += this.MHistory[i] ** 2;
    }
    EExpval  /= expvalHistoryLength;
    E2Expval /= expvalHistoryLength;
    MExpval  /= expvalHistoryLength;
    M2Expval /= expvalHistoryLength;
    const C   = (E2Expval - EExpval ** 2) / this.T ** 2;
    const chi = (M2Expval - MExpval ** 2) / this.T;

    this.EHistory  .pop();
    this.EHistory  .unshift(E);
    this.MHistory  .pop();
    this.MHistory  .unshift(M);
    this.CHistory  .pop();
    this.CHistory  .unshift(C);
    this.chiHistory.pop();
    this.chiHistory.unshift(chi);
  }

  drawStat() {
    $id("E").innerText   = format(this.EHistory  [0] / (this.Nx * this.Ny));
    $id("M").innerText   = format(this.MHistory  [0] / (this.Nx * this.Ny));
    $id("C").innerText   = format(this.CHistory  [0] / (this.Nx * this.Ny));
    $id("chi").innerText = format(this.chiHistory[0] / (this.Nx * this.Ny));
  }

  doOneMonteCarloStep() {
    // Select a cell.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    // Get current state and sigma of the cell.
    const stateCurr = this.states[this.Nx * y + x];
    const sigmaCurr = this.sigmas[stateCurr];

    // Propose a new state and sigma for the cell.
    // The new state must be different to the current one.
    const stateProp = (
      (Math.floor(Math.random() * (this.sigmas.length - 1)) + stateCurr + 1)
      % this.sigmas.length
    );
    const sigmaProp = this.sigmas[stateProp];

    // Calculate EProp - ECurr, where:
    // - EProp = energy of the system when the proposal is accepted
    // - ECurr = current energy of the system
    // You don't have to calculate EProp and ECurr directly
    // since only the cell and its neighbors contribute to the difference.
    const EDifference = (
      - this.J1 * (this.sigma(x + 1, y    ) + this.sigma(x - 1, y    ))
      - this.J2 * (this.sigma(x,     y + 1) + this.sigma(x,     y - 1))
      - this.J3 * (this.sigma(x + 1, y + 1) + this.sigma(x - 1, y - 1))
      - this.J4 * (this.sigma(x - 1, y + 1) + this.sigma(x + 1, y - 1))
      - this.J0 * (sigmaProp + sigmaCurr)
      - this.h
    ) * (sigmaProp - sigmaCurr);

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

  runOneFrame() {
    for (let i = 0; i < this.speed * this.Nx * this.Ny; i++) {
      this.doOneMonteCarloStep();
    }
    this.calculateStat();
    this.drawStat();
    this.canvasDrawer.draw();
    this.requestId = requestAnimationFrame(() => this.runOneFrame());
  }

  runOneGraphStep() {
    this.resetStates();

    for (let i = 0; i < graphLength * this.Nx * this.Ny; i++) {
      this.doOneMonteCarloStep();
      if (i % (this.Nx * this.Ny) === 0) {
        this.calculateStat();
      }
    }
    this.canvasDrawer.draw();

    let E   = 0;
    let M   = 0;
    let C   = 0;
    let chi = 0;
    for (let i = 0; i < graphHistoryLength; i++) {
      E   += this.EHistory[i];
      M   += this.MHistory[i];
      C   += this.CHistory[i];
      chi += this.chiHistory[i];
    }
    E   /= (graphHistoryLength * this.Nx * this.Ny);
    M   /= (graphHistoryLength * this.Nx * this.Ny);
    C   /= (graphHistoryLength * this.Nx * this.Ny);
    chi /= (graphHistoryLength * this.Nx * this.Ny);

    this.TGraph  .push(this.T);
    this.EGraph  .push(E);
    this.MGraph  .push(M);
    this.CGraph  .push(C);
    this.chiGraph.push(chi);
    this.graphDrawer.draw();

    for (const elem of document.querySelectorAll("#T > input")) {
      elem.value = this.T.toFixed(2).replace(/\.?0*$/, "");
    }
    $id("E")  .innerText = format(E  );
    $id("M")  .innerText = format(M  );
    $id("C")  .innerText = format(C  );
    $id("chi").innerText = format(chi);

    if (this.graphStep % 500 === 0) {
      $id("continue").disabled = false;
    } else {
      this.graphStep++;
      this.T = TPerGraphStep * this.graphStep;
      this.timeoutId = setTimeout(() => this.runOneGraphStep());
    }
  }
}

function getPredrawnCanvases(sigmas, zoom) {
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
    const context = canvas.getContext("2d", {transparent: false});

    // Draw background.
    const backgroundLightness = (
      (sigma - sigmaMin) / sigmaRange * lightnessRange + lightnessMin
    );
    context.fillStyle = `oklch(${backgroundLightness}% 0% 0deg)`;
    context.fillRect(0, 0, zoom, zoom);

    // Draw an arrow.
    if (zoom >= 8 * window.devicePixelRatio) {
      const transformedArrowPath = new Path2D();
      transformedArrowPath.addPath(arrowPath, {
        a: zoom / 16,
        d: sigma / sigmaAbsMax * zoom / 16,
        e: zoom / 2,
        f: zoom / 2,
      });
      const arrowLightness = (
        backgroundLightness < lightnessMiddle
        ? backgroundLightness + lightnessRange / 2
        : backgroundLightness - lightnessRange / 2
      );
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
    window.matchMedia("(min-resolution: 2dppx)")
    .addEventListener("change", (event) => {
      this.draw();
    });

    this.configure();
    this.draw();
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
      div.classList.add("sigma")
      div.classList.add("slider")
      div.append(canvas);
      div.append(number);
      div.append(range);
      $id("sigma-container").insertBefore(
        div, document.querySelector("#sigma-container > .button-container")
      );

      number.addEventListener("input", (event) => {
        range.value = number.valueAsNumber;
        this.model.sigmas[i] = number.valueAsNumber;
        this.draw();
        this.model.canvasDrawer.configure();
        this.model.canvasDrawer.draw();
      });
      range.addEventListener("input", (event) => {
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
 
    for (
      const [i, canvas]
      of document.querySelectorAll(".sigma > canvas").entries()
    ) {
      canvas.width = zoom;
      canvas.height = zoom;
      canvas.getContext("2d").drawImage(canvases[i], 0, 0);
    }
  }
}

class CanvasDrawer {
  constructor(model) {
    this.model = model;
    this.context = $id("canvas").getContext("2d", {alpha: false});

    // Watch for changes on window.devicePixelRatio.
    window.matchMedia("(min-resolution: 2dppx)")
    .addEventListener("change", (event) => {
      this.configure();
      this.draw();
    });

    new ResizeObserver(() => {
      this.configure();
      this.draw();
    }).observe($id("canvas-container"));

    this.configure();
    this.draw();
  }

  configure() {
    const dpr = window.devicePixelRatio;
    this.zoom = Math.min(Math.max(
      Math.floor(Math.min(
        $id("canvas-container").offsetWidth / this.model.Nx * dpr,
        $id("canvas-container").offsetHeight / this.model.Ny * dpr,
      )),
      1), 32 * dpr
    );

    $id("canvas").style.width = `${this.model.Nx * this.zoom / dpr}px`;
    $id("canvas").style.height = `${this.model.Ny * this.zoom / dpr}px`;
    $id("canvas").width = this.model.Nx * this.zoom;
    $id("canvas").height = this.model.Ny * this.zoom;

    this.canvases = getPredrawnCanvases(this.model.sigmas, this.zoom);
  }

  draw() {
    for (let y = 0; y < this.model.Ny; y++) {
      for (let x = 0; x < this.model.Nx; x++) {
        this.context.drawImage(
          this.canvases[this.model.states[this.model.Nx * y + x]],
          x * this.zoom, y * this.zoom,
        );
      }
    }
  }
}

class GraphDrawer {
  constructor(model) {
    this.model = model;

    this.EContext = $id("E-canvas").getContext("2d");
    this.MContext = $id("M-canvas").getContext("2d");
    this.CContext = $id("C-canvas").getContext("2d");
    this.chiContext = $id("chi-canvas").getContext("2d");

    // Watch for changes on window.devicePixelRatio.
    window.matchMedia("(min-resolution: 2dppx)")
    .addEventListener("change", (event) => {
      this.configure();
      this.draw();
    });

    this.configure();
  }

  configure() {
    // Canvas pixel per 1rem.
    this.rem = 16 * window.devicePixelRatio;

    // X and Y are in canvas coordinates.
    // Do not confuse them with x and y.
    this.XLeft = 1 * this.rem;
    this.XRight = 11 * this.rem;
    this.YTop = 0.5 * this.rem;
    this.YBottom = 10.5 * this.rem;

    for (const canvas of [
      $id("E-canvas"), $id("M-canvas"), $id("C-canvas"), $id("chi-canvas")
    ]) {
      canvas.width = 11.5 * this.rem;
      canvas.height = 11.5 * this.rem;
    }
  }

  draw() {
    const model = this.model;

    const TMax = 5;

    // Q stands for quantity.
    for (const [QGraph, QHistory, QContext] of [
      [model.EGraph,   model.EHistory,   this.EContext  ],
      [model.MGraph,   model.MHistory,   this.MContext  ],
      [model.CGraph,   model.CHistory,   this.CContext  ],
      [model.chiGraph, model.chiHistory, this.chiContext],
    ]) {
      // Erase.
      QContext.clearRect(0, 0, QContext.canvas.width, QContext.canvas.height);

      const [QMin, QMax, QTicks] = this.getQMinQMax(QGraph);

      // Draw vertical lines.
      for (let T = 0; T <= TMax; T++) {
        const X = this.XLeft + T / TMax * (this.XRight - this.XLeft);

        QContext.beginPath();
        QContext.moveTo(X, this.YTop);
        QContext.lineTo(X, this.YBottom);
        QContext.strokeStyle = "oklch(80% 0% 0deg)";
        QContext.strokeWidth = `{this.rem}`;
        QContext.stroke();

        QContext.font = `${this.rem / 2}px system-ui`;
        QContext.textAlign = "center";
        QContext.textBaseline = "middle";
        QContext.fillStyle = "oklch(80% 0% 0deg)";
        QContext.fillText(`${T}`, X, this.YBottom + this.rem / 2);
      }

      // Draw horizontal lines.
      for (let i = 0; i <= 5; i++) {
        const Q = QMax / 5 * i + QMin;

        const Y = this.YBottom - i * 64;

        QContext.beginPath();
        QContext.moveTo(this.XLeft, Y);
        QContext.lineTo(this.XRight, Y);
        QContext.strokeStyle = "oklch(80% 0% 0deg)";
        QContext.strokeWidth = `{this.rem}`;
        QContext.stroke();

        QContext.save();
        QContext.font = `${this.rem / 2}px system-ui`;
        QContext.textAlign = "center";
        QContext.textBaseline = "middle";
        QContext.fillStyle = "oklch(80% 0% 0deg)";
        QContext.translate(this.XLeft - this.rem / 2, Y);
        QContext.rotate(-Math.PI / 2);
        QContext.fillText(QTicks[i], 0, 0);
        QContext.restore();
      }

      // Draw dots.
      for (const [i, T] of model.TGraph.entries()) {
        const Q = QGraph[i];

        const X = this.XLeft + T / TMax * (this.XRight - this.XLeft);

        const Y = this.YBottom - (Q - QMin) / (QMax - QMin) * (this.YBottom - this.YTop);

        QContext.beginPath();
        QContext.ellipse(X, Y, this.rem / 16, this.rem / 16, 0, 0, 2 * Math.PI);
        QContext.fillStyle = "black";
        QContext.fill();
      }
    }
  }

  getQMinQMax(QGraph) {
    const max = Math.max(...QGraph);
    let min = Math.min(...QGraph);
    const ran = max - min;
    let exp = Math.ceil(Math.log10(ran)) - 1;
    let man = ran / 10 ** exp;

    if (exp <= -3) {
      exp = -3;
      man = 10;
    }

    for (const [newMan, altExp, altMan] of [
      [2.5, exp, 5], [5, exp, 10], [10, exp + 1, 2.5],
    ]) {
      if (man <= newMan) {
        let inc = newMan * 10 ** exp / 5;
        const newMin = Math.floor(min / inc) * inc;
        const newMax = newMan * 10 ** exp + newMin
        if (max <= newMax) {
          min = newMin;
          man = newMan;
        } else {
          exp = altExp;
          man = altMan;
          inc = man * 10 ** exp / 5;
          min = Math.floor(min / inc) * inc;
        }
        break;
      }
    }
    
    const QMin = min;
    const QMax = man * 10 ** exp + min;

    const QTicks = [];
    for (let i = 0; i <= 5; i++) {
      QTicks.push(
        (man * i * 10 ** exp / 5 + min).toFixed(6)
        .replace(/\.?0*$/, "").replace("-", "\u2212")
      );
    }

    return [QMin, QMax, QTicks];
  }
}

const model = new Model();
