function mod(a, b) {
  /// JS's % has a quirk for negative numbers.
  /// eg: -11 % 10 is -1, not 9.
  /// This function fixes this.

  return ((a % b) + b) % b;
}

class IsingModel {
  constructor() {
    const elem = (id) => document.getElementById(id);

    // Get HTML elements to put the results into.
    this.isingCanvas = elem("isingCanvas");
    this.graphCanvas = elem("graphCanvas");

    // Get canvas contexts.
    this.isingContext = isingCanvas.getContext("2d");
    this.graphContext = graphCanvas.getContext("2d");

    // Resize the canvas for the graph.
    this.graphWidth = 512;
    this.graphHalfHeight = 128;
    this.graphHeight = 2 * this.graphHalfHeight + 1;
    this.graphCanvas.width = this.graphWidth;
    this.graphCanvas.height = this.graphHeight;

    // Start the simulation when the user clicks the "Start!" button.
    elem("startButton").addEventListener("click", this.start.bind(this));
  }

  start(event) {
    /// Start the simulation.

    const elem = (id) => document.getElementById(id);

    // Stop the previous simulation.
    clearInterval(this.interval);

    // Get the parameters from the HTML elements.
    this.width = elem("widthInput").valueAsNumber;
    this.height = elem("heightInput").valueAsNumber;
    this.model = elem("modelSelect").value;
    this.speed = elem("speedInput").valueAsNumber;
    this.JNW = elem("JInputNW").valueAsNumber;
    this.JN = elem("JInputN").valueAsNumber;
    this.JNE = elem("JInputNE").valueAsNumber;
    this.JW = elem("JInputW").valueAsNumber;
    this.self = elem("JInputSelf").valueAsNumber;
    this.JE = elem("JInputE").valueAsNumber;
    this.JSW = elem("JInputSW").valueAsNumber;
    this.JS = elem("JInputS").valueAsNumber;
    this.JSE = elem("JInputSE").valueAsNumber;
    this.H = elem("HInput").valueAsNumber;
    this.kT = elem("kTInput").valueAsNumber;
    this.boundary = elem("boundarySelect").value;
    this.visualize = elem("visualizeInput").checked;

    // Number of neighbors (z).
    this.numNeighbors = this.height === 1 ? 2 : 4;

    // Resize the canvas for the ising model.
    this.isingCanvas.width = this.width;
    this.isingCanvas.height = this.height;
    this.isingCanvas.style.width = `${this.width * 4}px`;
    this.isingCanvas.style.height = `${this.height * 4}px`;

    if (this.model === "ising") {
      // Initialize the cell states.
      // Pick a random value distributed equally for the two states
      // for each cell.
      this.states = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        this.states[y] = new Array(this.width);
        for (let x = 0; x < this.width; x++) {
          this.states[y][x] = Math.random() < 0.5 ? -1 : 1;
        }
      }
    } else if (this.model === "3State") {
      this.states = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        this.states[y] = new Array(this.width);
        for (let x = 0; x < this.width; x++) {
          this.states[y][x] = [-1, 0, 1][Math.floor(Math.random() * 3)];
        }
      }
    } else if (this.model === "xy") {
      this.phis = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        this.phis[y] = new Array(this.width);
        for (let x = 0; x < this.width; x++) {
          this.phis[y][x] = Math.random() * 2 * Math.PI;
        }
      }
    } else if (this.model === "heisemberg") {
      this.phis = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        this.phis[y] = new Array(this.width);
        for (let x = 0; x < this.width; x++) {
          this.phis[y][x] = Math.random() * 2 * Math.PI;
        }
      }

      this.thetas = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        this.thetas[y] = new Array(this.width);
        for (let x = 0; x < this.width; x++) {
          this.thetas[y][x] = Math.random() * Math.PI;
        }
      }
    }

    // Draw the initial cell states.
    this.drawStates();

    // Erase the graph.
    this.graphContext.fillStyle = "oklch(0% 0% 0deg)";
    this.graphContext.fillRect(0, 0, this.graphWidth, this.graphHeight);

    // Initialize the time for the graph.
    this.grapht = 0;

    // Run the simulation every 10 ms.
    this.interval = setInterval(this.run.bind(this), 10);
  }

  run() {
    /// Run the simulation using the Metropolis algorithm,
    /// a Monte Carlo (random-based) algorithm for the Ising model.

    const elem = (id) => document.getElementById(id);

    for (let i = 0; i < this.speed; i++) {
      // Randomly select a cell to evaluate.
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(Math.random() * this.height);

      if (this.model === "ising") {
        // Get the current state and energy.
        const currState = this.states[y][x];
        const currE = this.getEnergy(x, y, currState)

        // Get the flipped state and the energy when the stateis flipped.
        const flipState = -currState;
        const flipE = -currE;

        // Determine the new state (flip or stay) by the probability to flip
        // based on the values of temperature, currE, and flipE.
        this.states[y][x] = (
          Math.random() < (
            this.kT <= 0 ? 0
            : Math.min(Math.exp(- (flipE - currE) / this.kT), 1)
          ) ? flipState : currState
        );
      } else if (this.model === "3State") {
        const currState = this.states[y][x];
        const currE = this.getEnergy(x, y, currState)

        const newState = [-1, 0, 1][Math.floor(Math.random() * 3)];
        const newE = this.getEnergy(x, y, newState)

        // Determine the new state (flip or stay) by the probability to flip
        // based on the values of temperature, currE, and flipE.
        this.states[y][x] = (
          Math.random() < (
            this.kT <= 0 ? 0
            : Math.min(Math.exp(- (newE - currE) / this.kT), 1)
          ) ? newState : currState
        );
      } else if (this.model === "xy") {
        const currPhi = this.phis[y][x];
        const currE = this.getEnergyFromPhi(x, y, currPhi);

        const newPhi = Math.random() * 2 * Math.PI;
        const newE = this.getEnergyFromPhi(x, y, newPhi);

        this.phis[y][x] = (
          Math.random() < (
            this.kT <= 0 ? 0
            : Math.min(Math.exp(- (newE - currE) / this.kT), 1)
          ) ? newPhi : currPhi
        );
      } else if (this.model === "heisemberg") {
        const currPhi = this.phis[y][x];
        const currTheta = this.thetas[y][x];
        const currE = this.getEnergyFromPhiAndTheta(x, y, currPhi, currTheta);

        const newPhi = Math.random() * 2 * Math.PI;
        const newTheta = Math.random() * Math.PI;
        const newE = this.getEnergyFromPhiAndTheta(x, y, newPhi, newTheta);

        const willAccept = (
          Math.random() < (
            this.kT <= 0 ? 0
            : Math.min(Math.exp(- (newE - currE) / this.kT), 1)
          )
        );

        if (willAccept) {
          this.phis[y][x] = newPhi;
          this.thetas[y][x] = newTheta;
        }
      }
    }

    // Calculate the magnetization and total energy.
    let M = 0;
    let U = 0;
    if (this.model === "ising" || this.model === "3State") {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          M += this.states[y][x] / (this.width * this.height);
          U += (
            this.getEnergy(x, y)
            / (this.width * this.height * this.numNeighbors)
          );
        }
      }
    }

    if (!this.visualize) {
      return;
    }

    // Update the number displays.
    elem("MDisplay").innerText = `= ${M.toFixed(3)}`;
    elem("UDisplay").innerText = `= ${U.toFixed(3)}`;

    // Draw the cell states.
    this.drawStates();

    // Draw the graph.
    this.drawGraph(M, U);

    // Increment time for the graph.
    this.grapht++;
  }

  getEnergy(x, y, currState) {
    /// Get current energy of the cell at (x, y).

    const interactionEnergy = (
        this.JNW  * currState * this.getState(x - 1, y - 1)
      + this.JN   * currState * this.getState(x,     y - 1)
      + this.JNE  * currState * this.getState(x + 1, y - 1)
      + this.JW   * currState * this.getState(x - 1, y    )
      + this.self * currState * currState
      + this.JE   * currState * this.getState(x + 1, y    )
      + this.JSW  * currState * this.getState(x - 1, y + 1)
      + this.JS   * currState * this.getState(x,     y + 1)
      + this.JSE  * currState * this.getState(x + 1, y + 1)
    );
    const fieldEnergy = -this.H * currState;

    return interactionEnergy + fieldEnergy;
  }

  getEnergyFromPhi(x, y, phi) {
    const interactionEnergy = (
        this.JNW * Math.cos(this.getPhi(x - 1, y - 1) - phi)
      + this.JN  * Math.cos(this.getPhi(x,     y - 1) - phi)
      + this.JNE * Math.cos(this.getPhi(x + 1, y - 1) - phi)
      + this.JW  * Math.cos(this.getPhi(x - 1, y    ) - phi)
      + this.JE  * Math.cos(this.getPhi(x + 1, y    ) - phi)
      + this.JSW * Math.cos(this.getPhi(x - 1, y + 1) - phi)
      + this.JS  * Math.cos(this.getPhi(x,     y + 1) - phi)
      + this.JSE * Math.cos(this.getPhi(x + 1, y + 1) - phi)
    );

    // TODO: Implement `fieldEnergy`.
    return interactionEnergy;
  }

  getEnergyFromPhiAndTheta(x, y, phi, theta) {
    const interactionEnergy = (
        this.JNW * this.getProduct(x - 1, y - 1, phi, theta)
      + this.JN  * this.getProduct(x,     y - 1, phi, theta)
      + this.JNE * this.getProduct(x + 1, y - 1, phi, theta)
      + this.JW  * this.getProduct(x - 1, y    , phi, theta)
      + this.JE  * this.getProduct(x + 1, y    , phi, theta)
      + this.JSW * this.getProduct(x - 1, y + 1, phi, theta)
      + this.JS  * this.getProduct(x,     y + 1, phi, theta)
      + this.JSE * this.getProduct(x + 1, y + 1, phi, theta)
    );

    // TODO: Implement `fieldEnergy`.
    return interactionEnergy;
  }

  getProduct(x, y, phi, theta) {
    const neighborPhi = this.getPhi(x, y);
    const neighborTheta = this.getTheta(x, y);

    return (
      Math.sin(theta) * Math.sin(neighborTheta) * (
        Math.cos(phi) * Math.cos(neighborPhi)
        + Math.sin(phi) * Math.sin(neighborPhi)
      ) + Math.cos(theta) * Math.cos(neighborTheta)
    );
  }

  getState(x, y) {
    /// Get the state of the cell at (x, y),
    /// considering the boundary condition if necessary.

    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      // The cell is not on the boundary.

      return this.states[y][x];
    } else {
      // The cell is on the boundary.

      if (this.height === 1 && y !== 0) {
        // Top and bottom boundary of 1D Ising model.

        return 0;
      }

      // Return the boundary state.
      switch (this.boundary) {
        case "periodic":
          return this.states[mod(y, this.height)][mod(x, this.width)];
          break;
        case "1":
          return 1;
          break;
        case "0":
          return 0;
          break;
        case "-1":
          return -1;
          break;
        default:
          log.assert(false);
      }
    }
  }

  getPhi(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      // The cell is not on the boundary.

      return this.phis[y][x];
    } else {
      // The cell is on the boundary.

      if (this.height === 1 && y !== 0) {
        // Top and bottom boundary of 1D Ising model.

        return 0;
      }

      // Return the boundary state.
      // TODO: Implement other boundary conditions.
      return this.phis[mod(y, this.height)][mod(x, this.width)];
    }
  }

  getTheta(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      // The cell is not on the boundary.

      return this.thetas[y][x];
    } else {
      // The cell is on the boundary.

      if (this.height === 1 && y !== 0) {
        // Top and bottom boundary of 1D Ising model.

        return 0;
      }

      // Return the boundary state.
      // TODO: Implement other boundary conditions.
      return this.thetas[mod(y, this.height)][mod(x, this.width)];
    }
  }

  drawStates() {
    /// Draw the cell states.

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {

        // Determine a color.
        if (this.model === "ising" || this.model === "3State") {
          switch (this.states[y][x]) {
            case 1:
              // this.isingContext.fillStyle = "oklch(50% 100% 90deg)";
              this.isingContext.fillStyle = "silver";
              break;
            case 0:
              this.isingContext.fillStyle = "oklch(50% 100% 180deg)";
              break;
            case -1:
              // this.isingContext.fillStyle = "oklch(50% 100% 270deg)";
              this.isingContext.fillStyle = "black";
              break;
	    case undefined:
              this.isingContext.fillStyle = "orange";
              break;
            default:
              console.assert(false);
          }
        } else if (this.model === "xy") {
          const deg = this.phis[y][x] / (2 * Math.PI) * 360;
          this.isingContext.fillStyle = `oklch(50% 100% ${deg}deg)`
        } else if (this.model === "heisemberg") {
          const luma = Math.cos(this.thetas[y][x]) * 50 + 50;
          const deg = this.phis[y][x] / (2 * Math.PI) * 360;
          this.isingContext.fillStyle = `oklch(${luma}% 100% ${deg}deg)`
        }

        // Fill a pixel.
        this.isingContext.fillRect(x, y, 1, 1);
      }
    }
  }

  drawGraph(M, U) {
    const t = this.grapht % this.graphWidth;

    // Erase vertically.
    this.graphContext.fillStyle = "oklch(0% 0% 0deg)";
    this.graphContext.fillRect(t, 0, 1, this.graphHeight);

    // Draw zero.
    this.graphContext.fillStyle = "oklch(25% 0% 0deg)";
    this.graphContext.fillRect(t, this.graphHalfHeight + 1, 1, 1);

    // Draw M.
    // Change the color based on the sign of M.
    this.graphContext.fillStyle = (
      M >= 0 ? "oklch(50% 100% 90deg)" : "oklch(50% 100% 270deg)"
    );
    this.graphContext.fillRect(
      t, -Math.floor(M * this.graphHalfHeight) + this.graphHalfHeight, 1, 1
    );

    // Draw U.
    this.graphContext.fillStyle = "oklch(50% 0% 0deg)";
    this.graphContext.fillRect(
      t, -Math.floor(U * this.graphHalfHeight) + this.graphHalfHeight, 1, 1
    );
  }
}

const isingModel = new IsingModel();

// I began to write this file as a hobby project.
// I did not use any AI tools to write this file.
