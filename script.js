const $id = id => document.getElementById(id);
const $query = query => document.querySelectorAll(query);

// In JavaScript, for example, -11 % 10 is -1, not 9.
const mod = (a, b) => ((a % b) + b) % b;

// "\u2212" is MINUS SIGN. "\u2014" is EM DASH.
const formatNumber = number => (
  isFinite(number) ? number.toFixed(3).replace("-", "\u2212") : "\u2014"
);

class Model {
  constructor() {
    this.canvas = $id("spin-canvas");
    this.context = this.canvas.getContext("2d");

    this.arrow = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

    // Currently historyLength >= additionalHistoryLength is assumed in the algorithm.
    this.historyLength = 50;
    this.additionalHistoryLength = 50;

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
      ["speed", 0,     0, 1, 0.2],
      ["T",     0,     0, 8, 2  ],
      ["J1",    null, -1, 1, 1  ],
      ["J2",    null, -1, 1, 1  ],
      ["J3",    null, -1, 1, 0  ],
      ["J4",    null, -1, 1, 0  ],
      ["J0",    null, -1, 1, 0  ],
      ["h",     null, -2, 2, 0  ],
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

    $query("speed input")

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

      $id("pause").style.display = "none";
      this.chiHistory = Array(this.historyLength);

      for (let i = 0; i < this.Nx * this.Ny; i++) {
        this.states[i] = Math.floor(Math.random() * this.possibleSpins.length);
      }
      drawStates();
    });

    $id("enter-graph-mode").addEventListener("click", (event) => {
      $id("enter-graph-mode").style.display = "none";
      $id("leave-graph-mode").style.display = "unset";

      cancelAnimationFrame(this.requestId);

      $id("graph-container").style.display = "flex";

      $id("spin-canvas").style.filter = "blur(0.5rem)";
      $id("spin-canvas").style.opacity = "50%";

      this.graphT = [];
      this.graphE = [];
      this.graphM = [];
      this.graphC = [];
      this.graphchi = [];

      this.timesAutoran = 0;
      this.TIndex = 1;
      this.setT(this.TIndex * 0.1);

      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      this.chiHistory = Array(this.historyLength);

      this.states.fill(0);

      this.requestId = requestAnimationFrame(this.autorun.bind(this));
    });

    $id("leave-graph-mode").addEventListener("click", (event) => {
      $id("enter-graph-mode").style.display = "unset";
      $id("leave-graph-mode").style.display = "none";

      $id("graph-container").style.display = "none";

      $id("spin-canvas").style.filter = "none";
      $id("spin-canvas").style.opacity = "unset";

      cancelAnimationFrame(this.requestId);

      this.requestId = requestAnimationFrame(this.run.bind(this));
    });

    $id("ising").addEventListener("input", (event) => {
      $id("isingFormula").style.display = "block";
      $id("xyFormula").style.display = "none";
    });
    $id("xy").addEventListener("input", (event) => {
      $id("isingFormula").style.display = "none";
      $id("xyFormula").style.display = "block";
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

    $id("add").addEventListener("click", (event) => {
      this.createSpin(1, this.possibleSpins.length);
    });

    for (const name of ["E", "M", "C", "chi"]) {
      const canvas = $id(`${name}-canvas`);
      this[`${name}Context`] = canvas.getContext("2d");
      canvas.style.width = "240px";
      canvas.style.height = "240px";
      canvas.width = 480;
      canvas.height = 480;
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
    sDiv.innerHTML = `
      <div class="parameter">
        <div><img src="img/remove.svg" alt="remove" /></div>
        <canvas id="spin${i}" style="border-radius: 0.25rem"></canvas>
        <input type="number" value="${spin}" step="0.01" />
      </div>
      <input type="range" value="${spin}" min="-2" max="2" step="0.01" list="zero-stop"/>
    this.CHistory = Array(this.historyLength);
    this.chiHistory = Array(this.historyLength);

    this.drawStates();
    `;
    this.sContainer.appendChild(sDiv);

    const number = sDiv.querySelector('input[type="number"]');
    const range = sDiv.querySelector('input[type="range"]');
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
  }

  redrawLegend() {
    const min_l = 5;
    const max_l = 95;
    const min_spin = Math.min(...this.possibleSpins);
    const max_spin = Math.max(...this.possibleSpins);
    const zoom = 64;

    for (let i = 0; i < this.possibleSpins.length; i++) {
      const spin = this.possibleSpins[i];
      const spinCanvas = $id(`spin${i}`);
      const spinContext = spinCanvas.getContext("2d");

      spinCanvas.width = 64;
      spinCanvas.height = 64;
      spinCanvas.style.width = "32px";
      spinCanvas.style.height = "32px";

      const l = (max_l - min_l) * (spin - min_spin) / (max_spin - min_spin) + min_l;
      spinContext.fillStyle = `oklch(${l}% 0% 0deg)`;

      spinContext.setTransform(1, 0, 0, 1, 0, 0);
      spinContext.fillRect(0, 0, zoom, zoom);

      spinContext.fillStyle = "oklch(50% 0% 0deg)";
      spinContext.setTransform(
        zoom / 16, 0, 0,
        spin / Math.max(Math.abs(max_spin), Math.abs(min_spin)) * zoom / 16,
        0.5 * zoom, 0.5 * zoom
      );
      spinContext.fill(this.arrow);
    }
  }

  setT(T) {
    this.T = T;
    for (const elem of $query("#T input")) {
      elem.value = `${this.T.toFixed(2)}`;
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
    this.graphE.push(E_);
    this.graphM.push(M_);
    this.graphC.push(C_);
    this.graphchi.push(chi_);
    this.drawGraph();

    this.timesAutoran = 0;
    this.TIndex++;
    if (this.TIndex <= 800) {
      this.setT(this.TIndex * 0.01);
      this.states.fill(0);

      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.CHistory = Array(this.historyLength);
      this.chiHistory = Array(this.historyLength);

      if (!this.requestId) {
        this.requestId = requestAnimationFrame(this.autorun.bind(this));
      }
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
        M += this.possibleSpins[this.states[this.Nx * y + x]];
        E += (
          /* No double counting! */
          - this.J1 * this.getSpin(x + 1, y    )
          - this.J2 * this.getSpin(x,     y + 1)
          - this.J3 * this.getSpin(x + 1, y + 1)
          - this.J4 * this.getSpin(x - 1, y + 1)
          - this.J0 * this.possibleSpins[this.states[this.Nx * y + x]]
          - this.h
        ) * this.possibleSpins[this.states[this.Nx * y + x]];
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
    $id("M").innerText = formatNumber(MPerCell);
    $id("E").innerText = formatNumber(EPerCell);
    $id("C").innerText = formatNumber(CPerCell);
    $id("chi").innerText = formatNumber(chiPerCell);

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
    const min_l = 5;
    const max_l = 95;
    const min_spin = Math.min(...this.possibleSpins);
    const max_spin = Math.max(...this.possibleSpins);

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
          (max_l - min_l) * (spin - min_spin) / (max_spin - min_spin) + min_l
        );
        this.context.fillStyle = `oklch(${l}% 0% 0deg)`;

        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.fillRect(x * zoom, y * zoom, zoom, zoom);

        if (zoom >= 16) {
          this.context.fillStyle = "oklch(50% 0% 0deg)";
          this.context.setTransform(
            zoom / 16, 0, 0,
            spin / Math.max(Math.abs(max_spin), Math.abs(min_spin)) * zoom / 16,
            (x + 0.5) * zoom, (y + 0.5) * zoom
          );
          this.context.fill(this.arrow);
        }
      }
    }
  }

  drawGraph() {
    for (const [graphQ, QHistory, QContext] of [
      [this.graphE, this.EHistory, this.EContext],
      [this.graphM, this.MHistory, this.MContext],
      [this.graphC, this.CHistory, this.CContext],
      [this.graphchi, this.chiHistory, this.chiContext],
    ]) {
      let max = Math.ceil(Math.max(...graphQ));
      let min = Math.floor(Math.min(...graphQ));
      if (min === max) {
        max = min + 1;
      }

      QContext.clearRect(0, 0, QContext.canvas.width, QContext.canvas.height);

      // Vertical lines
      for (let T = 0; T <= 8; T += 2) {
        const graphx = 40 + T * 50;

        QContext.strokeStyle = "oklch(80% 0% 0deg)";
        QContext.beginPath();
        QContext.moveTo(graphx, 40);
        QContext.lineTo(graphx, 440);
        QContext.stroke();

        QContext.font = "20px system-ui";
        QContext.fillStyle = "oklch(80% 0% 0deg)";
        QContext.textAlign = "center";
        QContext.textBaseline = "top";
        QContext.fillText(`${T}`, graphx, 445);
      }

      // Horizontal lines
      for (let i = min; i <= max; i++) {
        const graphy = 440 - 400 * (i - min) / (max - min);

        QContext.strokeStyle = "oklch(80% 0% 0deg)";
        QContext.beginPath();
        QContext.moveTo(40, graphy);
        QContext.lineTo(440, graphy);
        QContext.stroke();

        QContext.font = "20px system-ui";
        QContext.fillStyle = "oklch(80% 0% 0deg)";
        QContext.textAlign = "end";
        QContext.textBaseline = "middle";
        QContext.fillText(`${i}`, 35, graphy);
      }

      for (let i = 0; i < this.graphT.length; i++) {
        const T = this.graphT[i];
        const Q = graphQ[i];

        const graphx = 40 + T * 50;
        const graphy = 440 - 400 * (Q - min) / (max - min);

        QContext.fillStyle = "black";
        QContext.beginPath();
        QContext.ellipse(graphx, graphy, 2, 2, 0, 0, 2 * Math.PI);
        QContext.fill();
      }
    }
  }
}

const model = new Model();
