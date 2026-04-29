const $id = id => document.getElementById(id);

// Shape of an arrow
const arrowPath = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

// "\u2212": MINUS SIGN
// "\u2014": EM DASH
const formatToFixed = number => (
  isFinite(number) ? number.toFixed(3).replace("-", "\u2212") : "\u2014"
);

// Spin configuration
class Conf extends Array {
  resize(Nx, Ny) {
    this.length = Nx * Ny;
    this.reset();
  }
  
  reset() {
    this.fill(0);
  }
  
  randomize() {
    for (const [i, ] of this.entries()) {
      this[i] = Math.floor(2 * Math.random());
    }
  }
}

class Model {
  constructor() {
    // this.conf[this.Nx * y + x]: State at the cell (x, y)
    this.conf = new Conf();

    this.setUpControl();

    this.conf.resize(this.Nx, this.Ny);
    this.conf.randomize();
    
    this.sigmas = [1, -1];
    this.sigmaDrawer = new SigmaDrawer(this);

    this.sigmaDrawer.changeNumberOfStates();
    this.sigmaDrawer.draw();

    // Currently historyLength >= additionalHistoryLength is assumed in the algorithm.
    this.historyLength = 50;
    this.additionalHistoryLength = 50;
    this.EHistory = Array(this.historyLength);
    this.MHistory = Array(this.historyLength);
    this.CHistory = Array(this.historyLength);
    this.chiHistory = Array(this.historyLength);

    this.canvasDrawer = new CanvasDrawer(this);
    this.graphDrawer = new GraphDrawer(this);

    this.canvasDrawer.draw();

    this.requestId = requestAnimationFrame(this.run.bind(this));
  }

  setUpControl() {
    for (const [id, numberMin, rangeMin, rangeMax, initialValue] of [
      ["speed", 0,     0,  1, 0.5],
      ["T",     0,     0, 10, 2  ],
      ["J1",    null, -1,  1, 1  ],
      ["J2",    null, -1,  1, 1  ],
      ["J3",    null, -1,  1, 0  ],
      ["J4",    null, -1,  1, 0  ],
      ["J0",    null, -1,  1, 0  ],
      ["h",     null, -2,  2, 0  ],
    ]) {
      this[id] = initialValue;
      
      const number = $id(id).querySelector('input[type="number"]');
      if (numberMin !== null) {
        number.min = numberMin;
      }
      number.step = 0.01;
      number.value = initialValue;
      number.addEventListener("input", () => {
        this[id] = number.valueAsNumber;
        range.value = number.valueAsNumber;
      });
      
      const range = $id(id).querySelector('input[type="range"]');
      range.min = rangeMin;
      range.max = rangeMax;
      range.step = 0.01;
      range.value = initialValue;
      range.addEventListener("input", () => {
        this[id] = range.valueAsNumber;
        number.value = range.valueAsNumber;
      });
    }

    for (const [id, initialValue] of [["Nx", 50], ["Ny", 50]]) {
      this[id] = initialValue;
      $id(id).min = 1;
      $id(id).value = initialValue;
      $id(id).addEventListener("input", () => {
        this[id] = $id(id).valueAsNumber;
        this.conf.resize(this.Nx, this.Ny);
        this.canvasDrawer.resize();
      });
    }

    $id("play").addEventListener("click", () => {
      $id("play").style.display = "none";
      $id("pause").style.display = "";
      if (this.requestId) {
        cancelAnimationFrame(this.requestId);
        this.requestId = undefined;
      }
      this.requestId = requestAnimationFrame(this.run.bind(this));
    });

    $id("pause").addEventListener("click", () => {
      $id("pause").style.display = "none";
      $id("play").style.display = "";
      if (this.requestId) {
        cancelAnimationFrame(this.requestId);
        this.requestId = undefined;
      }
    });

    $id("reset").addEventListener("click", () => {
      this.conf.reset();
    });
    $id("randomize").addEventListener("click", () => {
      this.conf.randomize();
    });

    $id("add").addEventListener("click", (event) => {
      this.sigmas.push(0);
      this.sigmaDrawer.changeNumberOfStates();
      this.sigmaDrawer.draw();

      this.conf.reset();
      this.canvasDrawer.resize();
      this.canvasDrawer.draw();
    });

    $id("remove").addEventListener("click", (event) => {
      if (this.sigmas.length <= 2) {
        return;
      }

      this.sigmas.pop();
      this.sigmaDrawer.changeNumberOfStates();
      this.sigmaDrawer.draw();

      this.conf.reset();
      this.canvasDrawer.resize();
      this.canvasDrawer.draw();
    });

    $id("enter").addEventListener("click", (event) => {
      $id("play").style.display = "none";
      $id("pause").style.display = "none";
      $id("continue").removeAttribute("style");
      $id("continue").setAttribute("disabled", "");
      $id("enter").style.display = "none";
      $id("leave").removeAttribute("style");

      cancelAnimationFrame(this.requestId);

      $id("graph-container").removeAttribute("style");

      $id("canvas-container").style.overflow = "hidden";
      $id("canvas").style.filter = "blur(0.5rem)";
      $id("canvas").style.opacity = "10%";

      this.graphT = [];
      this.EGraph = [];
      this.MGraph = [];
      this.CGraph = [];
      this.chiGraph= [];

      this.timesAutoran = 0;
      this.TIndex = 1;
      this.setT(this.TIndex * 0.1);

      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      this.chiHistory = Array(this.historyLength);

      this.conf.fill(0);
      this.conf.reset();

      cancelAnimationFrame(this.requestId);
      this.autorun();
    });

    $id("leave").addEventListener("click", (event) => {
      $id("play").style.display = "none";
      $id("pause").removeAttribute("style");
      $id("continue").style.display = "none";
      $id("continue").removeAttribute("disabled");
      $id("enter").removeAttribute("style");
      $id("leave").style.display = "none";

      $id("graph-container").style.display = "none";

      // Do not use removeAttribute,
      // otherwise style.width and style.height will be lost.
      $id("canvas").style.overflow = "";
      $id("canvas").style.filter = "";
      $id("canvas").style.opacity = "";

      cancelAnimationFrame(this.requestId);

      clearTimeout(this.timeoutId);
      this.run();
    });

    $id("continue").addEventListener("click", (event) => {
      $id("play").style.display = "none";
      $id("pause").style.display = "none";
      $id("continue").removeAttribute("style");
      $id("continue").setAttribute("disabled", "");
      $id("enter").style.display = "none";
      $id("leave").removeAttribute("style");

      cancelAnimationFrame(this.requestId);

      $id("graph-container").removeAttribute("style");

      $id("canvas").style.filter = "blur(0.5rem)";
      $id("canvas").style.opacity = "10%";

      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      this.chiHistory = Array(this.historyLength);

      this.conf.fill(0);

      cancelAnimationFrame(this.requestId);
      this.autorun();
    });
  }

  setT(T) {
    this.T = T;
    for (const elem of document.querySelectorAll("#T input")) {
      elem.value = `${this.T.toFixed(2).replace(/\.?0*$/, "")}`;
    }
  }

  run(timestamp) {
    this.requestId = undefined;

    for (let i = 0; i < this.speed * this.Nx * this.Ny; i++) {
      // this.calculateStatistics();
      // Why did I put it here!? It was a severe performance issue!
      this.proposeNewConfiguration();
    }
    this.calculateStatistics();  // Should be here instead!
    this.canvasDrawer.draw();

    if (!this.requestId) {
      this.requestId = requestAnimationFrame(this.run.bind(this));
    }
  }

  autorun() {
    this.requestId = undefined;
    this.timeoutId = undefined;

    this.E = undefined;
    this.M = undefined;
    this.C = undefined;
    this.chi = undefined;

    this.EHistory = Array(this.historyLength);
    this.MHistory = Array(this.historyLength);
    this.CHistory = Array(this.historyLength);
    this.chiHistory = Array(this.historyLength);

    for (let i = 0; i < (this.historyLength + this.additionalHistoryLength) * this.Nx * this.Ny; i++) {
      this.proposeNewConfiguration();
      if (i % (this.Nx * this.Ny) === 0) {
        this.calculateStatistics();
      }
    }
    this.canvasDrawer.draw();

    this.timesAutoran++;

    let E_ = 0;
    let M_ = 0;
    let C_ = 0;
    let chi_ = 0;
    for (let i = 0; i < this.additionalHistoryLength; i++) {
      E_ += this.EHistory[i];
      M_ += this.MHistory[i];
      C_ += this.CHistory[i];
      chi_ += this.chiHistory[i];
    }
    E_ /= this.additionalHistoryLength * (this.Nx * this.Ny);
    M_ /= this.additionalHistoryLength * (this.Nx * this.Ny);
    C_ /= this.additionalHistoryLength * (this.Nx * this.Ny);
    chi_ /= this.additionalHistoryLength * (this.Nx * this.Ny);

    this.graphT.push(this.T);
    this.EGraph.push(E_);
    this.MGraph.push(M_);
    this.CGraph.push(C_);
    this.chiGraph.push(chi_);
    this.graphDrawer.draw();

    this.timesAutoran = 0;
    this.TIndex++;
    if (this.TIndex % 500 !== 1) {
      this.setT(this.TIndex * 0.01);
      this.conf.fill(0);

      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      /*
      if (!this.requestId) {
          this.requestId = requestAnimationFrame(this.autorun.bind(this));
      }
      */
      this.timeoutId = setTimeout(() => { this.autorun(); });
    } else {
      $id("continue").removeAttribute("disabled");
    }
  }

  proposeNewConfiguration() {
    // Randomly select a cell to change its state.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    // Current state
    const curr = this.conf[this.Nx * y + x];

    // Proposed state
    const prop = (
      (Math.floor(Math.random() * (this.sigmas.length - 1)) + curr + 1)
      % this.sigmas.length
    );

    const currSpin = this.sigmas[curr];
    const propSpin = this.sigmas[prop];

    const energyDifference = (
        this.J1 * (this.sigma(x + 1, y    ) + this.sigma(x - 1, y    ))
      + this.J2 * (this.sigma(x,     y + 1) + this.sigma(x,     y - 1))
      + this.J3 * (this.sigma(x + 1, y + 1) + this.sigma(x - 1, y - 1))
      + this.J4 * (this.sigma(x - 1, y + 1) + this.sigma(x + 1, y - 1))
      + this.J0 * (currSpin + propSpin)
      + this.h
    ) * (currSpin - propSpin);

    if (energyDifference < 0) {
      // If the new configuration has less energy,
      // always change the state.
      this.conf[this.Nx * y + x] = prop;
    } else {
      // If the new configuration has more energy,
      // change the state by the acceptance ratio.
      const acceptanceRatio = (
        this.T <= 0 ? 0 : Math.exp(-energyDifference / this.T)
      );
      if (Math.random() < acceptanceRatio) {
        this.conf[this.Nx * y + x] = prop;
      }
    }
  }

  calculateStatistics() {
    let M = 0;
    let E = 0;
    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {
        E += (
          /* No double counting! */
          - this.J1 * this.sigma(x + 1, y    )
          - this.J2 * this.sigma(x,     y + 1)
          - this.J3 * this.sigma(x + 1, y + 1)
          - this.J4 * this.sigma(x - 1, y + 1)
          - this.J0 * this.sigmas[this.conf[this.Nx * y + x]]
          - this.h
        ) * this.sigmas[this.conf[this.Nx * y + x]];
        M += this.sigmas[this.conf[this.Nx * y + x]];
      }
    }

    this.EHistory.pop();
    this.EHistory.unshift(E);
    this.MHistory.pop();
    this.MHistory.unshift(M);
    let EExpval = 0;
    let E2Expval = 0;
    let MExpval = 0;
    let M2Expval = 0;
    for (let a = 0; a < this.historyLength; a++) {
      EExpval += this.EHistory[a];
      E2Expval += this.EHistory[a] ** 2;
      MExpval += this.MHistory[a];
      M2Expval += this.MHistory[a] ** 2;
    }
    EExpval /= this.historyLength;
    E2Expval /= this.historyLength;
    MExpval /= this.historyLength;
    M2Expval /= this.historyLength;
    const C = (E2Expval - EExpval ** 2) / this.T ** 2;  // Actually C/k
    const chi = (M2Expval - MExpval ** 2) / this.T;
    this.CHistory.pop();
    this.CHistory.unshift(C);
    this.chiHistory.pop();
    this.chiHistory.unshift(chi);

    const MPerCell = M / (this.Nx * this.Ny);
    const EPerCell = E / (this.Nx * this.Ny);
    const CPerCell = C / (this.Nx * this.Ny);
    const chiPerCell = chi / (this.Nx * this.Ny);
    $id("M").innerText = formatToFixed(MPerCell);
    $id("E").innerText = formatToFixed(EPerCell);
    $id("C").innerText = formatToFixed(CPerCell);
    $id("chi").innerText = formatToFixed(chiPerCell);

    this.E = EPerCell;
    this.M = MPerCell;
    this.C = CPerCell;
    this.chi = chiPerCell;
  }

  sigma(x, y) {
    // Get sigma with taking the periodic boundary condition into account.

    if (x === -1) {
      x = this.Nx - 1;
    } else if (x === this.Nx) {
      x = 0;
    }

    if (y === -1) {
      y = this.Ny - 1;
    } else if (y === this.Ny) {
      y = 0;
    }

    return this.sigmas[this.conf[this.Nx * y + x]];
  }
}

function getPredrawnCanvases(sigmas, zoom) {
  const lightnessMin = 5;
  const lightnessMax = 95;
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

class CanvasDrawer {
  constructor(model) {
    this.model = model;
    this.context = $id("canvas").getContext("2d", {alpha: false});

    // Watch for changes on window.devicePixelRatio.
    window.matchMedia("(min-resolution: 2dppx)")
    .addEventListener("change", (event) => {
      this.resize();
      this.draw();
    });

    new ResizeObserver(() => {
      this.resize();
      this.draw();
    }).observe($id("canvas-container"));

    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio;
    this.zoom = Math.max(
      Math.floor(Math.min(
        $id("canvas-container").offsetWidth / this.model.Nx * dpr,
        $id("canvas-container").offsetHeight / this.model.Ny * dpr,
      )),
      1,
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
          this.canvases[this.model.conf[this.model.Nx * y + x]],
          x * this.zoom, y * this.zoom,
        );
      }
    }
  }
}

class SigmaDrawer {
  constructor(model) {
    this.model = model;

    // Watch for changes on window.devicePixelRatio.
    window.matchMedia("(min-resolution: 2dppx)")
    .addEventListener("change", (event) => {
      this.draw();
    });
  }

  changeNumberOfStates() {
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
      });
      range.addEventListener("input", (event) => {
        number.value = range.valueAsNumber;
        this.model.sigmas[i] = range.valueAsNumber;
        this.draw();
      });
    }

    $id("remove").disabled = this.model.sigmas.length <= 2;
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
      this.resize();
      this.draw();
    });

    this.resize();
  }

  resize() {
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
    for (const [QGraph, QHistory, QContext, isQAlwaysPositive] of [
      [model.EGraph,   model.EHistory,   this.EContext,   false],
      [model.MGraph,   model.MHistory,   this.MContext,   false],
      [model.CGraph,   model.CHistory,   this.CContext,   true ],
      [model.chiGraph, model.chiHistory, this.chiContext, true ],
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
      if (isQAlwaysPositive) {
        for (let i = 0; i <= 5; i++) {
          const Q = QMax / 5 * i;

          let Y;
          if (QMin === QMax) {
            Y = isQAlwaysPositive ? this.YBottom : this.YBottom - (this.YBottom - this.YTop) / 2;
          } else {
            Y = this.YBottom - (Q - QMin) / (QMax - QMin) * (this.YBottom - this.YTop);
          }

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
      } else {
        for (let Q = QMin; Q <= QMax; Q++) {
          let Y;
          if (QMin === QMax) {
            Y = isQAlwaysPositive ? this.YBottom : this.YBottom - (this.YBottom - this.YTop) / 2;
          } else {
            Y = this.YBottom - (Q - QMin) / (QMax - QMin) * (this.YBottom - this.YTop);
          }

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
          QContext.fillText(`${Q}`, 0, 0);
          QContext.restore();
        }
      }

      // Draw dots.
      for (const [i, T] of model.graphT.entries()) {
        const Q = QGraph[i];

        const X = this.XLeft + T / TMax * (this.XRight - this.XLeft);

        let Y;
        if (QMin === QMax) {
          Y = isQAlwaysPositive ? this.YBottom : this.YBottom - (this.YBottom - this.YTop) / 2;
        } else {
          Y = this.YBottom - (Q - QMin) / (QMax - QMin) * (this.YBottom - this.YTop);
        }

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
    if (exp >= -2 && exp <= 2) {
      for (let i = 0; i <= 5; i++) {
        QTicks.push((man * i * 10 ** exp / 5 + min).toString().replace("-", "\u2212"));
      }
    } else {
      for (let i = 0; i <= 5; i++) {
        QTicks.push((man * i * 10 ** exp / 5 + min).toExponential().replace("-", "\u2212"));
      }
    }

    return [QMin, QMax, QTicks];
  }
}

const model = new Model();
