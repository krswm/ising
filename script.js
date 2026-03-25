function mod(a, b) {
  // Modulo.
  // JavaScript's % has a quirk for negative numbers.
  // For instance, -11 % 10 is -1, not 9.

  return ((a % b) + b) % b;
}

function formatNumber(number) {
  if (isFinite(number)) {
    return number.toFixed(3).replace("-", "\u2212");  // Minus
  } else {
    return "\u2014";  // Em dash
  }
}

class Model {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.context = this.canvas.getContext("2d");

    this.arrow = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

    this.T = 2;
    this.J1 = 0.5;
    this.J2 = 0.5;
    this.J3 = 0.5;
    this.J4 = 0.5;
    this.J0 = 0;
    this.h = 0;
    this.speed = 0.1;
    this.Nx = 16;
    this.Ny = 16;
    this.zoom = 16;

    for (const id of ["T", "J1", "J2", "J3", "J4", "J0", "h", "speed"]) {
      for (const elem of document.querySelectorAll(`#${id} input`)) {
        elem.addEventListener("input", (event) => {
          this[id] = event.target.valueAsNumber;
        });
      }
    }

    document.getElementById("Nx").addEventListener("input", (event) => {
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
            newNx * y + oldNx, 0, ...Array(newNx - oldNx).fill(1)
          );
        }
      }

      this.Nx = newNx;
      this.drawStates();
    });

    document.getElementById("Ny").addEventListener("input", (event) => {
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
          this.Nx * oldNy, 0, ...Array(this.Nx * (newNy - oldNy)).fill(1)
        );
      }

      this.Ny = newNy;
      this.drawStates();
    });

    for (const elem of document.querySelectorAll("#zoom input")) {
      elem.addEventListener("input", (event) => {
        this.zoom = event.target.valueAsNumber;
        this.drawStates()
      });
    }

    this.historyLength = 500;
    document.getElementById("zoom").addEventListener("input", (event) => {
      this.zoom = event.target.valueAsNumber;
    });

    document.getElementById("play").addEventListener("click", (event) => {
      if (!this.requestId) {
        this.requestId = requestAnimationFrame(this.run.bind(this));
      }

      document.getElementById("play").style.display = "none";
      document.getElementById("pause").style.display = "inline-block";
    });

    document.getElementById("pause").addEventListener("click", (event) => {
      if (this.requestId) {
        cancelAnimationFrame(this.requestId);
        this.requestId = undefined;
      }

      document.getElementById("pause").style.display = "none";
      document.getElementById("play").style.display = "inline-block";
    });

    document.getElementById("reset").addEventListener("click", (event) => {
      this.states.fill(1);
      this.EHistory = Array(this.historyLength);
      this.MHistory = Array(this.historyLength);
      this.drawStates();
    });

    document.getElementById("randomize").addEventListener("click", (event) => {
      for (let i = 0; i < this.Nx * this.Ny; i++) {
        this.states[i] = Math.random() >= 0.5 ? 1 : -1;
      }
      this.drawStates();
    });

    document.getElementById("autorun").addEventListener("click", (event) => {
      document.getElementById("autorun").style.display = "none";
      document.getElementById("manual").style.display = "inline-block";

      cancelAnimationFrame(this.requestId);

      document.getElementById("graphContainer").style.display = "grid";

      this.graphT = [];
      this.graphE = [];
      this.graphM = [];
      this.graphC = [];
      this.graphchi = [];

      this.timesAutoran = 0;
      this.TIndex = 1;
      this.setT(this.TIndex * 0.05);
      this.requestId = requestAnimationFrame(this.autorun.bind(this));
    });

    document.getElementById("manual").addEventListener("click", (event) => {
      document.getElementById("autorun").style.display = "inline-block";
      document.getElementById("manual").style.display = "none";

      document.getElementById("graphContainer").style.display = "none";

      cancelAnimationFrame(this.requestId);

      this.requestId = requestAnimationFrame(this.run.bind(this));
    });

    // The state of the cell at (x, y) is this.states[this.Nx * y + x].
    this.states = Array(this.Nx * this.Ny).fill(1);

    for (const name of ["E", "M", "C", "chi"]) {
      const canvas = document.getElementById(`${name}Canvas`);
      this[`${name}Context`] = canvas.getContext("2d");
      canvas.style.width = "200px";
      canvas.style.height = "200px";
      canvas.width = 400;
      canvas.height = 400;
    }

    this.EHistory = Array(this.historyLength);
    this.MHistory = Array(this.historyLength);

    this.drawStates();

    this.requestId = requestAnimationFrame(this.run.bind(this));
  }

  setT(T) {
    this.T = T;
    for (const elem of document.querySelectorAll("#T input")) {
      elem.value = `${this.T.toFixed(1)}`;
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

    for (let i = 0; i < 5 * this.Nx * this.Ny; i++) {
      this.proposeNewConfigulation();
      if (i % (this.Nx * this.Ny) === 0) {
        this.calculateStatistics();
      }
    }
    this.drawStates();

    this.timesAutoran++;
    if (this.timesAutoran >= 100) {
      this.graphT.push(this.T);
      this.graphE.push(this.E);
      this.graphM.push(this.M);
      this.graphC.push(this.C);
      this.graphchi.push(this.chi);
      this.drawGraph();

      this.timesAutoran = 0;
      this.TIndex++;
      if (this.TIndex <= 80) {
        this.setT(this.TIndex * 0.05);
        this.states.fill(1);

        if (!this.requestId) {
          this.requestId = requestAnimationFrame(this.autorun.bind(this));
        }
      }
    } else {
      if (!this.requestId) {
        this.requestId = requestAnimationFrame(this.autorun.bind(this));
      }
    }
  }

  proposeNewConfigulation() {
    // Randomly select a cell to change its state.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    const energyDifference = (
      - this.J1 * (this.getState(x + 1, y    ) + this.getState(x - 1, y    ))
      - this.J2 * (this.getState(x,     y + 1) + this.getState(x,     y - 1))
      - this.J3 * (this.getState(x + 1, y + 1) + this.getState(x - 1, y - 1))
      - this.J4 * (this.getState(x - 1, y + 1) + this.getState(x + 1, y - 1))
      - this.J0 * this.states[this.Nx * y + x]
      - this.h
    ) * -2 * this.states[this.Nx * y + x];

    if (energyDifference < 0) {
      // If the new configuration has less energy,
      // always change the state.
      this.states[this.Nx * y + x] *= -1;
          } else {
      // If the new configuration has more energy,
      // change the state by the acceptance ratio.
      const acceptanceRatio = (
        this.T <= 0 ? 0 : Math.exp(-energyDifference / this.T)
      );
      if (Math.random() < acceptanceRatio) {
        this.states[this.Nx * y + x] *= -1;
      }
    }
  }

  calculateStatistics() {
    let M = 0;
    let E = 0;
    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {
        M += this.states[this.Nx * y + x];
        E += (
          /* No double counting! */
          - this.J1 * this.getState(x + 1, y    )
          - this.J2 * this.getState(x,     y + 1)
          - this.J3 * this.getState(x + 1, y + 1)
          - this.J4 * this.getState(x - 1, y + 1)
          - this.J0 * this.states[this.Nx * y + x]
          - this.h
        ) * this.states[this.Nx * y + x];
      }
    }

    this.EHistory.pop();
    this.EHistory.unshift(E);
    this.MHistory.pop();
    this.MHistory.unshift(E);
    let UExpval = 0;
    let U2Expval = 0;
    let MExpval = 0;
    let M2Expval = 0;
    for (let a = 0; a < this.historyLength; a++) {
      UExpval += this.EHistory[a];
      U2Expval += this.EHistory[a] ** 2;
      MExpval += this.MHistory[a];
      M2Expval += this.MHistory[a] ** 2;
    }
    UExpval /= this.historyLength;
    U2Expval /= this.historyLength;
    MExpval /= this.historyLength;
    M2Expval /= this.historyLength;
    const C = (U2Expval - UExpval ** 2) / this.T ** 2;  // Actually C/k
    const chi = (M2Expval - MExpval ** 2) / this.T;

    const MPerCell = M / (this.Nx * this.Ny);
    const EPerCell = E / (this.Nx * this.Ny);
    const CPerCell = C / (this.Nx * this.Ny);
    const chiPerCell = chi / (this.Nx * this.Ny);
    document.getElementById("M").innerText = formatNumber(MPerCell);
    document.getElementById("E").innerText = formatNumber(EPerCell);
    document.getElementById("C").innerText = formatNumber(CPerCell);
    document.getElementById("chi").innerText = formatNumber(chiPerCell);

    this.E = EPerCell;
    this.M = MPerCell;
    this.C = CPerCell;
    this.chi = chiPerCell;
  }

  getState(x, y) {
    /// Get the state of the cell at (x, y),
    /// considering the boundary condition if necessary.

    return this.states[this.Nx * mod(y, this.Ny) + mod(x, this.Nx)];
  }

  drawStates() {
    /// Draw the cell states.
    this.canvas.width = this.Nx * this.zoom;
    this.canvas.height = this.Ny * this.zoom;
    this.canvas.style.width = `${this.Nx * this.zoom / 2}px`;
    this.canvas.style.height = `${this.Ny * this.zoom / 2}px`;

    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {

        // Determine a color.
        switch (this.states[this.Nx * y + x]) {
          case 1:
            this.context.fillStyle = "#E0E0E0";
            this.context.setTransform(1, 0, 0, 1, 0, 0);
            this.context.fillRect(
              x * this.zoom, y * this.zoom, this.zoom, this.zoom
            );

            if (this.zoom >= 16) {
              this.context.fillStyle = "#808080";
              this.context.setTransform(
                this.zoom / 16, 0, 0, this.zoom / 16,
                (x + 0.5) * this.zoom, (y + 0.5) * this.zoom
              );
              this.context.fill(this.arrow);
            }

            break;
          case -1:
            this.context.fillStyle = "#202020";
            this.context.setTransform(1, 0, 0, 1, 0, 0);
            this.context.fillRect(
              x * this.zoom, y * this.zoom, this.zoom, this.zoom
            );

            if (this.zoom >= 16) {
              this.context.fillStyle = "#808080";
              this.context.setTransform(
                this.zoom / 16, 0, 0, -this.zoom / 16,
                (x + 0.5) * this.zoom, (y + 0.5) * this.zoom
              );
              this.context.fill(this.arrow);
            }

            break;
        }
      }
    }
  }

  drawGraph() {
    for (let i = 0; i < this.graphT.length; i++) {
      T = this.graphT[i];
      E = this.graphE[i];
      M = this.graphM[i];
      C = this.graphC[i];
      chi = this.graphchi[i];

      this.EContext.fillStyle = "black";
      this.EContext.beginPath();
      this.EContext.ellipse(
        T * 100, - E * 200, 5, 5, 0, 0, 2 * Math.PI
      );
      this.EContext.fill();

      this.MContext.fillStyle = "black";
      this.MContext.beginPath();
      this.MContext.ellipse(
        T * 100, 200 - M * 200, 5, 5, 0, 0, 2 * Math.PI
      );
      this.MContext.fill();

      this.CContext.fillStyle = "black";
      this.CContext.beginPath();
      this.CContext.ellipse(
        T * 100, 400 - C * 100, 5, 5, 0, 0, 2 * Math.PI
      );
      this.CContext.fill();

      this.chiContext.fillStyle = "black";
      this.chiContext.beginPath();
      this.chiContext.ellipse(
        T * 100, 400 - chi * 50, 5, 5, 0, 0, 2 * Math.PI
      );
      this.chiContext.fill();
    }
  }
}

const model = new Model();

// I began to write this file as a hobby project.
// I did not use any AI tools to write this file.
