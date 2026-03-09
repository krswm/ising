let isPlaying = true;

document.getElementById("play").addEventListener("click", (event) => {
  if (!model.requestId) {
    model.requestId = requestAnimationFrame(model.run.bind(model));
  }

  document.getElementById("play").style.display = "none";
  document.getElementById("pause").style.display = "inline-block";

  isPlaying = true;
});

document.getElementById("pause").addEventListener("click", (event) => {
  if (model.requestId) {
    cancelAnimationFrame(model.requestId);
    model.requestId = undefined;
  }

  document.getElementById("pause").style.display = "none";
  document.getElementById("play").style.display = "inline-block";

  isPlaying = false;
});

function mod(a, b) {
  // Return modulo.
  // Note that JavaScript's % has a quirk for negative numbers.
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

function spinDifference(sa, sb) {
  let diff = sb - sa;
  diff = mod(diff, 2 * Math.PI);
  if (diff < Math.PI) {
    return diff;
  } else {
    return diff - 2 * Math.PI;
  }
}

class Model {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.context = this.canvas.getContext("2d");

    this.arrow = new Path2D("M 0 -6 L 3 0 H 1 V 6 H -1 V 0 H -3 Z");

    this.T = 2;
    this.J = 1;
    this.h = 0;

    for (const id of ["T", "J", "h"]) {
      for (const elem of document.querySelectorAll(`#${id} input`)) {
        elem.addEventListener("input", (event) => {
          this[id] = event.target.valueAsNumber;
        });
      }
    }

    this.A = 100;

    this.start();
  }

  start(event) {
    cancelAnimationFrame(this.requestId);
    this.requestId = undefined;

    this.Nx = document.getElementById("Nx").valueAsNumber;
    this.Ny = document.getElementById("Ny").valueAsNumber;
    this.canvas.width = this.Nx * 64;
    this.canvas.height = this.Ny * 64;
    this.canvas.style.width = `${this.Nx * 32}px`;
    this.canvas.style.height = `${this.Ny * 32}px`;

    // The state of the cell at (x, y) is this.states[this.Nx * y + x].
    this.states = []
    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {
        this.states.push(1);
      }
    }

    this.EHistory = [];
    this.MHistory = [];
    for (let i = 0; i < this.A; i++) {
      this.EHistory.push(undefined);
      this.MHistory.push(undefined);
    }

    this.drawStates();

    if (!this.requestId) {
      this.requestId = requestAnimationFrame(this.run.bind(this));
    }
  }

  run(timestamp) {
    this.requestId = undefined;

    for (let i = 0; i < 100; i++) {
      this.proposeNewConfigulation();
    }
    this.calculateStatistics();
    this.drawStates();

    if (!this.requestId) {
      this.requestId = requestAnimationFrame(this.run.bind(this));
    }
  }

  proposeNewConfigulation() {
    // Randomly select a cell to change its state.
    const x = Math.floor(Math.random() * this.Nx);
    const y = Math.floor(Math.random() * this.Ny);

    const energyDifference = (
      - this.J * this.getState(x + 1, y    )
      - this.J * this.getState(x,     y + 1)
      - this.J * this.getState(x - 1, y    )
      - this.J * this.getState(x,     y - 1)
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
          - this.J * this.getState(x + 1, y    )
          - this.J * this.getState(x,     y + 1)
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
    for (let a = 0; a < this.A; a++) {
      UExpval += this.EHistory[a];
      U2Expval += this.EHistory[a] ** 2;
      MExpval += this.MHistory[a];
      M2Expval += this.MHistory[a] ** 2;
    }
    UExpval /= this.A;
    U2Expval /= this.A;
    MExpval /= this.A;
    M2Expval /= this.A;
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

    return [EPerCell, MPerCell, CPerCell, chiPerCell];
  }

  getState(x, y) {
    /// Get the state of the cell at (x, y),
    /// considering the boundary condition if necessary.

    return this.states[this.Nx * mod(y, this.Ny) + mod(x, this.Nx)];
  }

  drawStates() {
    /// Draw the cell states.

    for (let y = 0; y < this.Ny; y++) {
      for (let x = 0; x < this.Nx; x++) {

        // Determine a color.
        switch (this.states[this.Nx * y + x]) {
          case 1:
            this.context.fillStyle = "#E0E0E0";
            this.context.setTransform(1, 0, 0, 1, 0, 0);
            this.context.fillRect(x * 64, y * 64, 64, 64);

            this.context.fillStyle = "#808080";
            this.context.setTransform(4, 0, 0, 4, x * 64 + 32, y * 64 + 32);
            this.context.fill(this.arrow);
            break;
          case -1:
            this.context.fillStyle = "#202020";
            this.context.setTransform(1, 0, 0, 1, 0, 0);
            this.context.fillRect(x * 64, y * 64, 64, 64);

            this.context.fillStyle = "#808080";
            this.context.setTransform(4, 0, 0, -4, x * 64 + 32, y * 64 + 32);
            this.context.fill(this.arrow);
            break;
        }
      }
    }
  }
}

const model = new Model();

// I began to write this file as a hobby project.
// I did not use any AI tools to write this file.
