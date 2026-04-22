const $id = id => document.getElementById(id);

// Shape of an arrow
const arrowPath = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

// "\u2212" is MINUS SIGN. "\u2014" is EM DASH.
const formatToFixed = number => (
  isFinite(number) ? number.toFixed(3).replace("-", "\u2212") : "\u2014"
);
const formatToString = number => (
  isFinite(number) ? number.toString().replace("-", "\u2212") : "\u2014"
);

class IsingModel {
  constructor() {
    for (const div of document.querySelectorAll(".slider")) {
      const number = div.querySelector('input[type="number"]');
      const range = div.querySelector('input[type="range"]');

      number.addEventListener("input", (event) => {
        range.value = event.target.valueAsNumber;
      });

      range.addEventListener("input", (event) => {
        number.value = event.target.valueAsNumber;
      });
    }

    // Currently historyLength >= additionalHistoryLength is assumed in the algorithm.
    this.historyLength = 50;
    this.additionalHistoryLength = 50;

    this.Nx = 50;
    this.Ny = 50;

    this.sigmas = [1, -1];

    this.sigmaDrawer = new SigmaDrawer(this);

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

      for (const elem of document.querySelectorAll(`#${id} input`)) {
        if (elem.type === "number" && numberMin !== null) {
          elem.min = numberMin;
        } else if (elem.type === "range") {
          elem.min = rangeMin;
          elem.max = rangeMax;
        }
        elem.step = 0.01;
        elem.value = initialValue;

        elem.addEventListener("input", (event) => {
          this[id] = elem.valueAsNumber;
        });
      }
    }

    $id("Nx").addEventListener("input", (event) => {
      const oldNx = this.Nx;
      const newNx = event.target.valueAsNumber;

      if (newNx < oldNx) {
        // ABC    AB
        // DEF -> DE
        // GHI    GH
        for (let y = this.Ny - 1; y >= 0; y--) {
          this.states.splice(oldNx * y + newNx, oldNx - newNx);
        }
      } else if (newNx > oldNx) {
        // ABC    ABC1
        // DEF -> DEF1
        // GHI    GHI1
        for (let y = 0; y < this.Ny; y++) {
          this.states.splice(
            newNx * y + oldNx, 0, ...Array(newNx - oldNx).fill(0)
          );
        }
      }

      this.Nx = newNx;
      this.canvasDrawer.resize();
      this.canvasDrawer.draw();
    });

    $id("Ny").addEventListener("input", (event) => {
      const oldNy = this.Ny;
      const newNy = event.target.valueAsNumber;

      if (newNy < oldNy) {
        // ABC    ABC
        // DEF -> DEF
        // GHI
        this.states.splice(this.Nx * newNy);
      } else if (newNy > oldNy) {
        // ABC    ABC1
        // DEF -> DEF1
        // GHI    GHI1
        this.states.splice(
          this.Nx * oldNy, 0, ...Array(this.Nx * (newNy - oldNy)).fill(0)
        );
      }

      this.Ny = newNy;
      this.canvasDrawer.resize();
      this.canvasDrawer.draw();
    });

    $id("play").addEventListener("click", (event) => {
      if (!this.requestId) {
        this.requestId = requestAnimationFrame(this.run.bind(this));
      }

      $id("play").style.display = "none";
      $id("pause").style.display = "inline-block";
    });

    $id("pause").addEventListener("click", (event) => {
      if (this.requestId) {
        cancelAnimationFrame(this.requestId);
        this.requestId = undefined;
      }

      $id("pause").style.display = "none";
      $id("play").style.display = "inline-block";
    });

    $id("reset").addEventListener("click", (event) => {
      this.states.fill(0);
      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      this.chiHistory = Array(this.historyLength);
      this.canvasDrawer.draw();
    });

    $id("randomize").addEventListener("click", (event) => {
      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      this.chiHistory = Array(this.historyLength);

      if (this.requestId) {
        this.requestId = undefined;
      }

      this.chiHistory = Array(this.historyLength);

      for (let i = 0; i < this.Nx * this.Ny; i++) {
        this.states[i] = Math.floor(Math.random() * this.sigmas.length);
      }
      this.canvasDrawer.draw();
    });

    $id("add").addEventListener("click", (event) => {
      this.sigmas.push(0);
      this.sigmaDrawer.changeNumberOfStates();
      this.sigmaDrawer.draw();

      this.states.fill(0);
      this.canvasDrawer.resize();
      this.canvasDrawer.draw();
    });

    $id("remove").addEventListener("click", (event) => {
      if (this.sigmas.length < 3) {
        return
      }

      this.sigmas.pop();

      this.sigmaDrawer.changeNumberOfStates();
      this.sigmaDrawer.draw();

      this.states.fill(0);
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

      this.states.fill(0);

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

      this.states.fill(0);

      cancelAnimationFrame(this.requestId);
      this.autorun();
    });

    // The state of the cell at (x, y) is this.states[this.Nx * y + x].
    this.states = Array(this.Nx * this.Ny).fill(0);

    this.sigmaDrawer.changeNumberOfStates();
    this.sigmaDrawer.draw();

    this.EHistory = Array(this.historyLength);
    this.MHistory = Array(this.historyLength);
    this.CHistory = Array(this.historyLength);
    this.chiHistory = Array(this.historyLength);

    this.canvasDrawer = new CanvasDrawer(this);
    this.graphDrawer = new GraphDrawer(this);

    this.canvasDrawer.draw();

    this.requestId = requestAnimationFrame(this.run.bind(this));
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
      this.states.fill(0);

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
    const curr = this.states[this.Nx * y + x];

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
      this.states[this.Nx * y + x] = prop;
    } else {
      // If the new configuration has more energy,
      // change the state by the acceptance ratio.
      const acceptanceRatio = (
        this.T <= 0 ? 0 : Math.exp(-energyDifference / this.T)
      );
      if (Math.random() < acceptanceRatio) {
        this.states[this.Nx * y + x] = prop;
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
          - this.J0 * this.sigmas[this.states[this.Nx * y + x]]
          - this.h
        ) * this.sigmas[this.states[this.Nx * y + x]];
        M += this.sigmas[this.states[this.Nx * y + x]];
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

    return this.sigmas[this.states[this.Nx * y + x]];
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
  constructor(isingModel) {
    this.isingModel = isingModel;
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
    this.zoom = Math.floor(Math.min(
      $id("canvas-container").offsetWidth / this.isingModel.Nx * dpr,
      $id("canvas-container").offsetHeight / this.isingModel.Ny * dpr,
    ));

    $id("canvas").style.width = `${this.isingModel.Nx * this.zoom / dpr}px`;
    $id("canvas").style.height = `${this.isingModel.Ny * this.zoom / dpr}px`;
    $id("canvas").width = this.isingModel.Nx * this.zoom;
    $id("canvas").height = this.isingModel.Ny * this.zoom;

    this.canvases = getPredrawnCanvases(this.isingModel.sigmas, this.zoom);
  }

  draw() {
    for (let y = 0; y < this.isingModel.Ny; y++) {
      for (let x = 0; x < this.isingModel.Nx; x++) {
        this.context.drawImage(
          this.canvases[this.isingModel.states[this.isingModel.Nx * y + x]],
          x * this.zoom, y * this.zoom,
        );
      }
    }
  }
}

class SigmaDrawer {
  constructor(isingModel) {
    this.isingModel = isingModel;

    // Watch for changes on window.devicePixelRatio.
    window.matchMedia("(min-resolution: 2dppx)")
    .addEventListener("change", (event) => {
      this.draw();
    });
  }

  changeNumberOfStates() {
    $id("sigma").replaceChildren();

    for (const [i, sigma] of this.isingModel.sigmas.entries()) {
      const canvas = document.createElement("canvas");

      const text = document.createElement("div");
      text.innerText = `State #${i + 1}`;

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
      div.classList.add("slider")
      div.append(canvas);
      div.append(text);
      div.append(number);
      div.append(range);
      $id("sigma").append(div);

      number.addEventListener("input", (event) => {
        range.value = event.target.valueAsNumber;
        this.isingModel.sigmas[i] = event.target.valueAsNumber;
        this.draw();
        this.isingModel.spinDrawer.resize();
      });
      range.addEventListener("input", (event) => {
        number.value = event.target.valueAsNumber;
        this.isingModel.sigmas[i] = event.target.valueAsNumber;
        this.draw();
        this.isingModel.spinDrawer.resize();
      });
    }
  }

  draw() {
    const zoom = 32 * window.devicePixelRatio;
    const canvases = getPredrawnCanvases(this.isingModel.sigmas, zoom);
 
    for (
      const [i, canvas]
      of document.querySelectorAll("#sigma > div > canvas").entries()
    ) {
      canvas.width = zoom;
      canvas.height = zoom;
      canvas.getContext("2d").drawImage(canvases[i], 0, 0);
    }
  }
}

class GraphDrawer {
  constructor(isingModel) {
    this.isingModel = isingModel;

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
    const model = this.isingModel;

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

      // const QMax = Math.ceil(Math.max(...QGraph));
      let QMax = 0;
      let QTicks = ["0.0"];
      if (isQAlwaysPositive) {
        const max = Math.max(...QGraph);
        const exp = Math.ceil(Math.log10(max)) - 1;
        const man = max / 10 ** exp;
        if (man <= 2.5) {
          QMax = 2.5 * 10 ** exp;
          if (exp === -1) {
            QTicks = ["0", "0.05", "0.1", "0.15", "0.2", "0.25"];
          } else if (exp === 0) {
            QTicks = ["0", "0.5", "1", "1.5", "2", "2.5"];
          } else if (exp === 1) {
            QTicks = ["0", "5", "10", "15", "20", "25"];
          } else {
            QTicks = [];
            for (const tick of ["0", "0.5", "1", "1.5", "2", "2.5"]) {
              QTicks.push(`${tick}e${exp}`);
            }
          }
        } else if (man <= 5) {
          QMax = 5 * 10 ** exp;
          if (exp === -1) {
            QTicks = ["0", "0.1", "0.2", "0.3", "0.4", "0.5"];
          } else if (exp === 0) {
            QTicks = ["0", "1", "2", "3", "4", "5"];
          } else if (exp === 1) {
            QTicks = ["0", "10", "20", "30", "40", "50"];
          } else {
            for (const tick of ["0", "1", "2", "3", "4", "5"]) {
              QTicks.push(`${tick}e${exp}`);
            }
          }
        } else if (man <= 10) {
          QMax = 10 * 10 ** exp;
          if (exp === -1) {
            QTicks = ["0", "0.2", "0.4", "0.6", "0.8", "1"];
          } else if (exp === 0) {
            QTicks = ["0", "2", "4", "6", "8", "10"];
          } else if (exp === 1) {
            QTicks = ["0", "20", "40", "60", "80", "100"];
          } else {
            for (const tick of ["0", "2", "4", "6", "8", "10"]) {
              QTicks.push(`${tick}e${exp}`);
            }
          }
        }
      } else {
        QMax = Math.ceil(Math.max(...QGraph));
      }
      
      const QMin = isQAlwaysPositive ? 0 : Math.floor(Math.min(...QGraph));

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
        QContext.fillText(formatToString(T), X, this.YBottom + this.rem / 2);
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
          QContext.fillText(formatToString(Q), 0, 0);
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
}

const isingModel = new IsingModel();
