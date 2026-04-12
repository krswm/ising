const $id = id => document.getElementById(id);
const $query = query => document.querySelectorAll(query);

// In JavaScript, for example, -11 % 10 is -1, not 9.
const mod = (a, b) => ((a % b) + b) % b;

// "\u2212" is MINUS SIGN. "\u2014" is EM DASH.
const toFixedFormat = number => (
  isFinite(number) ? number.toFixed(3).replace("-", "\u2212") : "\u2014"
);
const toStringFormat = number => (
  isFinite(number) ? number.toString().replace("-", "\u2212") : "\u2014"
);

function pairSlider(div) {
  const number = div.querySelector('input[type="number"]');
  const range = div.querySelector('input[type="range"]');

  number.addEventListener("input", (event) => {
    range.value = event.target.valueAsNumber;
  });

  range.addEventListener("input", (event) => {
    number.value = event.target.valueAsNumber;
  });
}

for (const div of document.querySelectorAll(".slider")) {
  pairSlider(div);
}

class Model {
  constructor() {
    this.canvas = $id("spin-canvas");
    this.context = this.canvas.getContext("2d");

    this.arrow = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

    // Currently historyLength >= additionalHistoryLength is assumed in the algorithm.
    this.historyLength = 100;
    this.additionalHistoryLength = 100;

    this.T = 2;
    this.J1 = 1;
    this.J2 = 1;
    this.J3 = 0;
    this.J4 = 0;
    this.J0 = 0;
    this.h = 0;
    this.speed = 0.25;
    this.Nx = 20;
    this.Ny = 20;

    this.possibleSpins = [1, -1];

    for (const [id, numberMin, rangeMin, rangeMax, initialValue] of [
      ["speed", 0,     0,  1, 0.2],
      ["T",     0,     0, 10, 2  ],
      ["J1",    null, -1,  1, 1  ],
      ["J2",    null, -1,  1, 1  ],
      ["J3",    null, -1,  1, 0  ],
      ["J4",    null, -1,  1, 0  ],
      ["J0",    null, -1,  1, 0  ],
      ["h",     null, -2,  2, 0  ],
    ]) {
      for (const elem of $query(`#${id} input`)) {
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
      this.drawStates();
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
      this.drawStates();
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
      this.drawStates();
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
        this.states[i] = Math.floor(Math.random() * this.possibleSpins.length);
      }
      drawStates();
    });

    $id("add-state").addEventListener("click", (event) => {
      this.createSpin(0, this.possibleSpins.length);
      this.redrawLegend();

      this.states.fill(0);
      this.drawStates();
    });

    $id("remove-state").addEventListener("click", (event) => {
      if (this.possibleSpins.length < 3) {
        return
      }

      this.removeSpin();
      this.redrawLegend();

      this.states.fill(0);
      this.drawStates();
    });

    $id("enter-graph-mode").addEventListener("click", (event) => {
      $id("enter-graph-mode").style.display = "none";
      $id("leave-graph-mode").style.display = "unset";

      cancelAnimationFrame(this.requestId);

      $id("graph-container").style.display = "grid";

      $id("spin-canvas").style.filter = "blur(1rem)";
      $id("spin-canvas").style.opacity = "10%";

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

    $id("leave-graph-mode").addEventListener("click", (event) => {
      $id("enter-graph-mode").style.display = "unset";
      $id("leave-graph-mode").style.display = "none";

      $id("graph-container").style.display = "none";

      $id("spin-canvas").style.filter = "none";
      $id("spin-canvas").style.opacity = "unset";

      cancelAnimationFrame(this.requestId);

      clearTimeout(this.timeoutId);
      this.run();
    });

    this.canvasContainerWidth = (
      $id("canvas-container").offsetWidth
    );
    this.canvasContainerHeight = (
      $id("canvas-container").offsetHeight
    );
    new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.canvasContainerWidth = entry.target.offsetWidth;
        this.canvasContainerHeight = entry.target.offsetHeight;
      }
      this.drawStates();
    }).observe($id("canvas-container"));

    // The state of the cell at (x, y) is this.states[this.Nx * y + x].
    this.states = Array(this.Nx * this.Ny).fill(0);

    this.sContainer = $id("sContainer");
    for (let i = 0; i < this.possibleSpins.length; i++) {
      const spin = this.possibleSpins[i];
      this.createSpin(spin, i);
    }
    this.redrawLegend();

    for (const name of ["E", "M", "C", "chi"]) {
      const canvas = $id(`${name}-canvas`);
      this[`${name}Context`] = canvas.getContext("2d");
      canvas.style.width = `${16 * 11.5}px`;
      canvas.style.height = `${16 * 11.5}px`;
      canvas.width = 32 * 11.5;
      canvas.height = 32 * 11.5;
    }

    this.EHistory = Array(this.historyLength);
    this.MHistory = Array(this.historyLength);
    this.CHistory = Array(this.historyLength);
    this.chiHistory = Array(this.historyLength);

    this.drawStates();

    this.requestId = requestAnimationFrame(this.run.bind(this));
  }

  createSpin(spin, i) {
    const sDiv = document.createElement("div");
    sDiv.classList.add("slider")

    const div = document.createElement("div");
    div.style.width = "100%";

    const canvas = document.createElement("canvas");
    canvas.id = `spin${i}`;
    canvas.style = "border-radius: 0.25rem; width: 32px; height: 32px;";

    const number = document.createElement("input");
    number.type = "number";
    number.step = "0.01";
    number.value = `${spin}`;

    const parameterDiv = document.createElement("div");
    parameterDiv.classList.add("parameter");
    parameterDiv.append(canvas);
    parameterDiv.append(div);
    parameterDiv.append(number);

    const range = document.createElement("input");
    // Order is important! Set min and max then value.
    range.type = "range";
    range.min = "-2";
    range.max = "2";
    range.step = "0.01";
    range.value = `${spin}`;
      
    sDiv.append(parameterDiv);
    sDiv.append(range);
    this.sContainer.append(sDiv);

    number.addEventListener("input", (event) => {
      range.value = event.target.valueAsNumber;
      this.possibleSpins[i] = event.target.valueAsNumber;
      this.redrawLegend();
    });
    range.addEventListener("input", (event) => {
      number.value = event.target.valueAsNumber;
      this.possibleSpins[i] = event.target.valueAsNumber;
      this.redrawLegend();
    });

    this.possibleSpins[i] = spin;
  }

  removeSpin() {
    const l = this.possibleSpins.length - 1;
    this.possibleSpins.pop();
    document.querySelector("#sContainer > :last-child").remove();

  }

  redrawLegend() {
    const min_l = 5;
    const max_l = 95;
    const min_spin = Math.min(...this.possibleSpins);
    const max_spin = Math.max(...this.possibleSpins);
    const zoom = 64;

    for (const [i, slider] of this.sContainer.childNodes.entries()) {
      const spin = this.possibleSpins[i];
      const spinCanvas = slider.querySelector("canvas");

      spinCanvas.width = 64;
      spinCanvas.height = 64;

      const spinContext = spinCanvas.getContext("2d");

      const l = (max_l - min_l) * (spin - min_spin) / (max_spin - min_spin) + min_l;
      spinContext.fillStyle = `oklch(${l}% 0% 0deg)`;

      spinContext.setTransform(1, 0, 0, 1, 0, 0);
      spinContext.fillRect(0, 0, zoom, zoom);

      const arrow = new Path2D();
      arrow.addPath(this.arrow, {
        a: zoom / 16,
        d: spin / Math.max(Math.abs(max_spin), Math.abs(min_spin)) * zoom / 16,
        e: 0.5 * zoom,
        f: 0.5 * zoom,
      });

      spinContext.fillStyle = "oklch(50% 0% 0deg)";
      spinContext.fill(arrow);

      spinContext.lineWidth = 4;
      spinContext.lineJoin = "round";
      spinContext.strokeStyle = "oklch(50% 0% 0deg)";
      spinContext.stroke(arrow);
    }
  }

  setT(T) {
    this.T = T;
    for (const elem of $query("#T input")) {
      elem.value = `${this.T.toFixed(2).replace(/\.?0*$/, "")}`;
    }
  }

  run(timestamp) {
    this.requestId = undefined;

    for (let i = 0; i < this.speed * this.Nx * this.Ny; i++) {
      this.calculateStatistics();
      this.proposeNewConfigulation();
    }
    this.drawStates();

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
      this.proposeNewConfigulation();
      if (i % (this.Nx * this.Ny) === 0) {
        this.calculateStatistics();
      }
    }
    this.drawStates();

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
    this.drawGraph();

    this.timesAutoran = 0;
    this.TIndex++;
    if (this.TIndex <= 1000) {
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
      this.timeoutId = setTimeout(this.autorun.bind(this));
    }
  }

  proposeNewConfigulation() {
    // Randomly select a cell to change its state.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    // Current state
    const curr = this.states[this.Nx * y + x];

    // Proposed state
    const prop = (
      (Math.floor(Math.random() * (this.possibleSpins.length - 1)) + curr + 1)
      % this.possibleSpins.length
    );

    const currSpin = this.possibleSpins[curr];
    const propSpin = this.possibleSpins[prop];

    const energyDifference = (
        this.J1 * (this.getSpin(x + 1, y    ) + this.getSpin(x - 1, y    ))
      + this.J2 * (this.getSpin(x,     y + 1) + this.getSpin(x,     y - 1))
      + this.J3 * (this.getSpin(x + 1, y + 1) + this.getSpin(x - 1, y - 1))
      + this.J4 * (this.getSpin(x - 1, y + 1) + this.getSpin(x + 1, y - 1))
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
          - this.J1 * this.getSpin(x + 1, y    )
          - this.J2 * this.getSpin(x,     y + 1)
          - this.J3 * this.getSpin(x + 1, y + 1)
          - this.J4 * this.getSpin(x - 1, y + 1)
          - this.J0 * this.possibleSpins[this.states[this.Nx * y + x]]
          - this.h
        ) * this.possibleSpins[this.states[this.Nx * y + x]];
        M += this.possibleSpins[this.states[this.Nx * y + x]];
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
    $id("M").innerText = toFixedFormat(MPerCell);
    $id("E").innerText = toFixedFormat(EPerCell);
    $id("C").innerText = toFixedFormat(CPerCell);
    $id("chi").innerText = toFixedFormat(chiPerCell);

    this.E = EPerCell;
    this.M = MPerCell;
    this.C = CPerCell;
    this.chi = chiPerCell;
  }

  getSpin(x, y) {
    /// Get the state of the cell at (x, y),
    /// considering the boundary condition if necessary.

    return this.possibleSpins[
      this.states[this.Nx * mod(y, this.Ny) + mod(x, this.Nx)]
    ];
  }

  drawStates() {
    const lightnessMin = 5;
    const lightnessMax = 95;
    const sMin = Math.min(...this.possibleSpins);
    const sMax = Math.max(...this.possibleSpins);

    const zoom = Math.floor(Math.min(
      this.canvasContainerWidth / this.Nx * 2,
      this.canvasContainerHeight / this.Ny * 2,
    ));

    /// Draw the cell states.
    this.canvas.width = this.Nx * zoom;
    this.canvas.height = this.Ny * zoom;
    this.canvas.style.width = `${this.Nx * zoom / 2}px`;
    this.canvas.style.height = `${this.Ny * zoom / 2}px`;

    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {
        const spin = this.possibleSpins[this.states[this.Nx * y + x]];
        const l = (
          (lightnessMax - lightnessMin) * (spin - sMin ) / (sMax - sMin ) + lightnessMin
        );
        this.context.fillStyle = `oklch(${l}% 0% 0deg)`;

        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.fillRect(x * zoom, y * zoom, zoom, zoom);

        if (zoom >= 16) {
          this.context.fillStyle = "oklch(50% 0% 0deg)";

          const arrow = new Path2D();
          arrow.addPath(this.arrow, {
            a: zoom / 16,
            d: spin / Math.max(Math.abs(sMax), Math.abs(sMin )) * zoom / 16,
            e: (x + 0.5) * zoom,
            f: (y + 0.5) * zoom,
          });

          this.context.fill(arrow);

          this.context.lineWidth = zoom / 16;
          this.context.lineJoin = "round";
          this.context.strokeStyle = "oklch(50% 0% 0deg)";
          this.context.stroke(arrow);
        }
      }
    }
  }

  drawGraph() {
    // Canvas coordinates
    // Do not confuse them with x and y (position of spin).
    const XLeft = 32 * 1;
    const XRight = 32 * 11;
    const YTop = 32 * 0.5;
    const Ybottom = 32 * 10.5;

    const TMax = 10;

    // Q stands for quantity.
    for (const [QGraph, QHistory, QContext, isQAlwaysPositive] of [
      [this.EGraph, this.EHistory, this.EContext, false],
      [this.MGraph, this.MHistory, this.MContext, false],
      [this.CGraph, this.CHistory, this.CContext, true],
      [this.chiGraph, this.chiHistory, this.chiContext, true],
    ]) {
      // Erase.
      QContext.clearRect(0, 0, QContext.canvas.width, QContext.canvas.height);

      const QMax = Math.ceil(Math.max(...QGraph));
      const QMin = isQAlwaysPositive ? 0 : Math.floor(Math.min(...QGraph));

      // Draw vertical lines.
      for (let T = 0; T <= TMax; T++) {
        const X = XLeft + T / TMax * (XRight - XLeft);

        QContext.beginPath();
        QContext.moveTo(X, YTop);
        QContext.lineTo(X, Ybottom);
        QContext.strokeStyle = "oklch(80% 0% 0deg)";
        QContext.stroke();

        QContext.font = "16px system-ui";
        QContext.textAlign = "center";
        QContext.textBaseline = "middle";
        QContext.fillStyle = "oklch(80% 0% 0deg)";
        QContext.fillText(toStringFormat(T), X, Ybottom + 16);
      }

      // Draw horizontal lines.
      for (let Q = QMin; Q <= QMax; Q++) {
        let Y;
        if (QMin === QMax) {
          Y = isQAlwaysPositive ? Ybottom : Ybottom - (Ybottom - YTop) / 2;
        } else {
          Y = Ybottom - (Q - QMin) / (QMax - QMin) * (Ybottom - YTop);
        }

        QContext.beginPath();
        QContext.moveTo(XLeft, Y);
        QContext.lineTo(XRight, Y);
        QContext.strokeStyle = "oklch(80% 0% 0deg)";
        QContext.stroke();

        QContext.save();
        QContext.font = "16px system-ui";
        QContext.textAlign = "center";
        QContext.textBaseline = "middle";
        QContext.fillStyle = "oklch(80% 0% 0deg)";
        QContext.translate(XLeft - 16, Y);
        QContext.rotate(-Math.PI / 2);
        QContext.fillText(toStringFormat(Q), 0, 0);
        QContext.restore();
      }

      // Draw dots.
      for (const [i, T] of this.graphT.entries()) {
        const Q = QGraph[i];

        const X = XLeft + T / TMax * (XRight - XLeft);

        let Y;
        if (QMin === QMax) {
          Y = isQAlwaysPositive ? Ybottom : Ybottom - (Ybottom - YTop) / 2;
        } else {
          Y = Ybottom - (Q - QMin) / (QMax - QMin) * (Ybottom - YTop);
        }

        QContext.beginPath();
        QContext.ellipse(X, Y, 2, 2, 0, 0, 2 * Math.PI);
        QContext.fillStyle = "black";
        QContext.fill();
      }
    }
  }
}

const model = new Model();
