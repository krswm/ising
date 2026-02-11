function mod(a, b) {
  // Return modulo.
  // Note that JavaScript's % has a quirk for negative numbers.
  // For instance, -11 % 10 is -1, not 9.

  return ((a % b) + b) % b;
}

class Model {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.context = canvas.getContext("2d");

    for (let id of [
      "kT", "mm", "zm", "pm", "mz", "zz", "pz", "mp", "zp", "pp", "h"
    ]) {
      this[id] = document.getElementById(id).valueAsNumber;
      document.getElementById(id).addEventListener("change", (event) => {
        this[id] = event.target.valueAsNumber;
      });
    }

    this.coloring = document.getElementById("coloring").value;
    document.getElementById("coloring").addEventListener("change", (event) => {
      this.coloring = event.target.value;
      if (this.model === "xy" && this.coloring === "normal") {
        document.getElementById("img").style.display = "flex";
      } else {
        document.getElementById("img").style.display = "none";
      }
    });

    this.intervalDelay = 10;  // ms
    this.proposalsPerInterval = (
      document.getElementById("speed").valueAsNumber * this.intervalDelay
    );
    document.getElementById("speed").addEventListener("change", (event) => {
      this.proposalsPerInterval = (
        event.target.valueAsNumber * this.intervalDelay
      );
    });

    this.start();
  }

  start(event) {
    clearInterval(this.interval);

    this.model = document.getElementById("model").value;
    let initialState;
    if (this.model === "ising") {
      initialState = 1;
      document.getElementById("hLabel").style.display = "block";
      document.getElementById("coloringLabel").style.display = "none";
    } else if (this.model === "xy") {
      initialState = 0;
      document.getElementById("hLabel").style.display = "none";
      document.getElementById("coloringLabel").style.display = "block";
    }
    if (this.model === "xy" && this.coloring === "normal") {
      document.getElementById("img").style.display = "flex";
    } else {
      document.getElementById("img").style.display = "none";
    }

    this.X = document.getElementById("X").valueAsNumber;
    this.Y = document.getElementById("Y").valueAsNumber;
    this.canvas.width = this.X;
    this.canvas.height = this.Y;
    this.canvas.style.width = `${this.X * 4}px`;
    this.canvas.style.height = `${this.Y * 4}px`;

    // The state of the cell at (x, y) is this.states[this.X * y + x].
    // s = -1, 1 for the Ising model.
    // 0 <= theta < 2pi for the XY model.
    this.states = []
    for (let y = 0; y < this.Y; y++) {
      for (let x = 0; x < this.X; x++) {
        this.states.push(initialState);
      }
    }

    this.drawStates();

    this.interval = setInterval(this.run.bind(this), this.intervalDelay);
  }

  run() {
    /// Run the simulation using the Metropolis algorithm,
    /// a Monte Carlo (random-based) algorithm for the Ising model.

    for (let i = 0; i < this.proposalsPerInterval; i++) {
      // Randomly select a cell to evaluate.
      const x = Math.floor(Math.random() * this.X);
      const y = Math.floor(Math.random() * this.Y);

      if (this.model === "ising") {
        // Get the current state and energy.
        const currState = this.states[this.X * y + x];
        const currE = this.getEnergy(x, y, currState)

        // Get the flipped state and the energy when the stateis flipped.
        const flipState = -currState;
        const flipE = -currE;

        // Determine the new state (flip or stay) by the probability to flip
        // based on the values of temperature, currE, and flipE.
        this.states[this.X * y + x] = (
          Math.random() < (
            this.kT <= 0 ? 0
            : Math.min(Math.exp(- (flipE - currE) / this.kT), 1)
          ) ? flipState : currState
        );
      } else if (this.model === "xy") {
        const currState = this.states[this.X * y + x];
        const currE = this.getEnergyFromPhi(x, y, currState);

        const newState = Math.random() * 2 * Math.PI;
        const newE = this.getEnergyFromPhi(x, y, newState);

        this.states[this.X * y + x] = (
          Math.random() < (
            this.kT <= 0 ? 0
            : Math.min(Math.exp(- (newE - currE) / this.kT), 1)
          ) ? newState : currState
        );
      }
    }

    // Calculate the magnetization and total energy.
    let M = 0;
    let U = 0;
    if (this.model === "ising") {
      for (let y = 0; y < this.Y; y++) {
        for (let x = 0; x < this.X; x++) {
          M += this.states[this.X * y + x] / (this.X * this.Y);
          U += (
            this.getEnergy(x, y)
            / (this.X * this.Y * 2)
          );
        }
      }
    }

    // Update the number displays.
    document.getElementById("MDisplay").innerText = `= ${M.toFixed(3)}`;
    document.getElementById("UDisplay").innerText = `= ${U.toFixed(3)}`;

    // Draw the cell states.
    this.drawStates();
  }

  getEnergy(x, y, currState) {
    /// Get current energy of the cell at (x, y).

    const interactionEnergy = (
        this.mm * currState * this.getState(x - 1, y - 1)
      + this.zm * currState * this.getState(x,     y - 1)
      + this.pm * currState * this.getState(x + 1, y - 1)
      + this.mz * currState * this.getState(x - 1, y    )
      + this.zz * currState * currState
      + this.pz * currState * this.getState(x + 1, y    )
      + this.mp * currState * this.getState(x - 1, y + 1)
      + this.zp * currState * this.getState(x,     y + 1)
      + this.pp * currState * this.getState(x + 1, y + 1)
    );
    const fieldEnergy = this.h * currState;

    return interactionEnergy + fieldEnergy;
  }

  getEnergyFromPhi(x, y, phi) {
    const interactionEnergy = (
        this.mm * Math.cos(this.getState(x - 1, y - 1) - phi)
      + this.zm * Math.cos(this.getState(x,     y - 1) - phi)
      + this.pm * Math.cos(this.getState(x + 1, y - 1) - phi)
      + this.mz * Math.cos(this.getState(x - 1, y    ) - phi)
      + this.zz
      + this.pz * Math.cos(this.getState(x + 1, y    ) - phi)
      + this.mp * Math.cos(this.getState(x - 1, y + 1) - phi)
      + this.zp * Math.cos(this.getState(x,     y + 1) - phi)
      + this.pp * Math.cos(this.getState(x + 1, y + 1) - phi)
    );

    // TODO: Implement `fieldEnergy`.
    return interactionEnergy;
  }

  getState(x, y) {
    /// Get the state of the cell at (x, y),
    /// considering the boundary condition if necessary.

    return this.states[this.X * mod(y, this.Y) + mod(x, this.X)];
  }

  drawStates() {
    /// Draw the cell states.

    for (let y = 0; y < this.Y; y++) {
      for (let x = 0; x < this.X; x++) {

        // Determine a color.
        if (this.model === "ising") {
          switch (this.states[this.X * y + x]) {
            case 1:
              this.context.fillStyle = "silver";
              break;
            case -1:
              this.context.fillStyle = "black";
              break;
          }
        } else if (this.model === "xy") {
          if (this.coloring === "normal") {
            const deg = this.states[this.X * y + x] * 180 / Math.PI;
            this.context.fillStyle = `oklch(50% 75% ${deg}deg)`;
          } else if (this.coloring === "curl") {
            const curl = (
              + Math.sin(this.getState(x, y + 1))
              - Math.cos(this.getState(x + 1, y))
              - Math.sin(this.getState(x, y - 1))
              + Math.cos(this.getState(x - 1, y))
            );
            if (curl >= 0) {
              const l = curl * 50;
              this.context.fillStyle = `oklch(${l}% ${l}% 0deg)`;
            } else {
              const l = -curl * 50;
              this.context.fillStyle = `oklch(${l}% ${l}% 180deg)`;
            }
          }
        }

        // Fill a pixel.
        this.context.fillRect(x, y, 1, 1);
      }
    }
  }
}

function changeModelP(willRerender) {
  const modelP = document.getElementById("modelP")
  modelP.innerHTML = {
    ising: (
      "\\[\\begin{gathered} "
      + "E_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} "
      + "= \\sum_{\\substack{\\Delta x \\\\ \\Delta y}} "
      + "J_{\\substack{\\Delta x \\\\ \\Delta y}} \\, "
      + "s_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} \\, "
      + "s_{\\substack{x + \\Delta x \\\\ y + \\Delta y}} "
      + "+ h \\, "
      + "s_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} \\\\ "
      + "(s_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} "
      + "= - 1, 1) "
      + "\\end{gathered}\\]"
    ),
    xy: (
      "\\[\\begin{gathered} "
      + "E_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} "
      + "= \\sum_{\\substack{\\Delta x \\\\ \\Delta y}} "
      + "J_{\\substack{\\Delta x \\\\ \\Delta y}} \\cos ("
      + "\\theta_{\\substack{x + \\Delta x \\\\ y + \\Delta y}} "
      + "- \\theta_{\\substack{x \\vphantom{\\Delta} \\\\ "
      + "y \\vphantom{\\Delta}}}) \\\\ "
      + "(0 \\le \\theta_{\\substack{x \\vphantom{\\Delta} \\\\ "
      + "y \\vphantom{\\Delta}}} < 2 \\pi) "
      + "\\end{gathered}\\]"
    ),
  }[document.getElementById("model").value];
  if (willRerender) {
    renderMathInElement(modelP);
  }
}
changeModelP(false);

const model = new Model();

let isPlaying = true;
document.getElementById("playPause").addEventListener("click", (event) => {
  if (isPlaying) {
    clearInterval(model.interval);
    event.target.innerHTML = "Play";
    isPlaying = false;
  } else {
    model.interval = setInterval(model.run.bind(model), this.intervalDelay);
    event.target.innerHTML = "Pause";
    isPlaying = true;
  }
});

// I began to write this file as a hobby project.
// I did not use any AI tools to write this file.
