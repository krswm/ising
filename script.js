let isPlaying = true;
document.getElementById("playPause").addEventListener("click", (event) => {
  if (isPlaying) {
    if (model.requestId) {
      cancelAnimationFrame(model.requestId);
      model.requestId = undefined;
    }
    event.target.innerHTML = "Play";
    isPlaying = false;
  } else {
    if (!model.requestId) {
      model.requestId = requestAnimationFrame(model.run.bind(model));
    }
    event.target.innerHTML = "Pause";
    isPlaying = true;
  }
});

function mod(a, b) {
  // Return modulo.
  // Note that JavaScript's % has a quirk for negative numbers.
  // For instance, -11 % 10 is -1, not 9.

  return ((a % b) + b) % b;
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

    this.vorticityCanvas = document.getElementById("vorticity");
    this.vorticityContext = this.vorticityCanvas.getContext("2d");

    for (let id of ["kT", "J0", "J1", "J2", "J3", "J4", "h", "Deltat"]) {
      this[id] = document.getElementById(id).valueAsNumber;
      document.getElementById(id).addEventListener("change", (event) => {
	this[id] = event.target.valueAsNumber;
      });
    }

    this.start();
  }

  start(event) {
    cancelAnimationFrame(this.requestId);
    this.requestId = undefined;

    this.model = document.getElementById("model").value;
    let initialState;
    if (this.model === "ising") {
      initialState = 1;
      document.getElementById("isingStatistics").style.display = "block";
      document.getElementById("xyStatistics").style.display = "none";
      document.getElementById("hLabel").style.display = "block";
      document.getElementById("vorticity").style.display = "none";
    } else if (this.model === "xy") {
      initialState = 0;
      document.getElementById("isingStatistics").style.display = "none";
      document.getElementById("xyStatistics").style.display = "block";
      document.getElementById("hLabel").style.display = "none";
      document.getElementById("vorticity").style.display = "block";
    }
    if (this.model === "xy") {
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
    this.vorticityCanvas.width = this.X;
    this.vorticityCanvas.height = this.Y;
    this.vorticityCanvas.style.width = `${this.X * 4}px`;
    this.vorticityCanvas.style.height = `${this.Y * 4}px`;

    // The state of the cell at (x, y) is this.states[this.X * y + x].
    // s = -1, 1 for the Ising model.
    // 0 <= theta < 2pi for the XY model.
    this.states = []
    for (let y = 0; y < this.Y; y++) {
      for (let x = 0; x < this.X; x++) {
        this.states.push(initialState);
      }
    }

    this.A = document.getElementById("A").valueAsNumber;
    this.EHistory = [];
    this.MHistory = [];
    for (let i = 0; i < this.A; i++) {
      this.EHistory.push(undefined);
      this.MHistory.push(undefined);
    }

    this.drawStates();

    if (!self.requestId) {
      self.requestId = requestAnimationFrame(this.run.bind(this));
    }
  }

  run(timestamp) {
    self.requestId = undefined;

    for (let i = 0; i < this.Deltat; i++) {
      this.proposeNewConfigulation();
    }
    this.calculateStatistics();
    this.drawStates();

    if (!self.requestId) {
      self.requestId = requestAnimationFrame(this.run.bind(this));
    }
  }

  autorun(event) {
    const kTMax = document.getElementById("kTMax").valueAsNumber;
    const kTStep = document.getElementById("kTStep").valueAsNumber;
    const tMax = document.getElementById("tMax").valueAsNumber;

    let csv = "kT,EPerCell,MPerCell,CPerCell,chiPerCell\n";

    for (let k = 1; this.kT < kTMax; k++) {
      this.kT = k * kTStep;
      document.getElementById("kT").value = this.kT;
      for (let j = 0; j < tMax; j++) {
	for (let i = 0; i < this.Deltat; i++) {
	  this.proposeNewConfigulation();
	}
	this.calculateStatistics();
      }
      const [EPerCell, MPerCell, CPerCell, chiPerCell] = (
	this.calculateStatistics()
      );
      const line = (
	`${this.kT},${EPerCell},${MPerCell},${CPerCell},${chiPerCell}\n`
      );
      console.log(line);
      csv += line;
    }

    event.target.innerHTML = "Download CSV";
    event.target.onclick = () => {
      const download = document.getElementById("download");
      const blob = new Blob([csv], {type: "text/csv"});
      const url = window.URL.createObjectURL(blob);
      download.href = url;
      download.download = "ising.csv";
      download.click();
    }
  }

  proposeNewConfigulation() {
    // Randomly select a cell to change its state.
    const x = Math.floor(Math.random() * this.X);
    const y = Math.floor(Math.random() * this.Y);

    if (this.model === "ising") {
      const energyDifference = (
	+ this.J0 * this.getState(x,     y    )
	+ this.J1 * this.getState(x + 1, y    )
	+ this.J2 * this.getState(x + 1, y + 1)
	+ this.J3 * this.getState(x,     y + 1)
	+ this.J4 * this.getState(x - 1, y + 1)
	+ this.J1 * this.getState(x - 1, y    )
	+ this.J2 * this.getState(x - 1, y - 1)
	+ this.J3 * this.getState(x,     y - 1)
	+ this.J4 * this.getState(x + 1, y - 1)
	+ this.h
      ) * -2 * this.states[this.X * y + x];

      if (energyDifference < 0) {
	// If the new configuration has less energy,
	// always change the state.
	this.states[this.X * y + x] *= -1;
      } else {
	// If the new configuration has more energy,
	// change the state by the acceptance ratio.
	const acceptanceRatio = (
	  this.kT <= 0 ? 0 : Math.exp(-energyDifference / this.kT)
	);
	if (Math.random() < acceptanceRatio) {
	  this.states[this.X * y + x] *= -1;
	}
      }
    } else if (this.model === "xy") {
      // Current state.
      const currState = this.states[this.X * y + x];

      // Proposed state.
      const propState = Math.random() * 2 * Math.PI;

      const energyDifference = (
	+ this.J0 * Math.cos(this.getState(x,     y    ))
	+ this.J1 * Math.cos(this.getState(x + 1, y    ))
	+ this.J2 * Math.cos(this.getState(x + 1, y + 1))
	+ this.J3 * Math.cos(this.getState(x,     y + 1))
	+ this.J4 * Math.cos(this.getState(x - 1, y + 1))
	+ this.J1 * Math.cos(this.getState(x - 1, y    ))
	+ this.J2 * Math.cos(this.getState(x - 1, y - 1))
	+ this.J3 * Math.cos(this.getState(x,     y - 1))
	+ this.J4 * Math.cos(this.getState(x + 1, y - 1))
      ) * (Math.cos(propState) - Math.cos(currState)) + (
	+ this.J0 * Math.sin(this.getState(x,     y    ))
	+ this.J1 * Math.sin(this.getState(x + 1, y    ))
	+ this.J2 * Math.sin(this.getState(x + 1, y + 1))
	+ this.J3 * Math.sin(this.getState(x,     y + 1))
	+ this.J4 * Math.sin(this.getState(x - 1, y + 1))
	+ this.J1 * Math.sin(this.getState(x - 1, y    ))
	+ this.J2 * Math.sin(this.getState(x - 1, y - 1))
	+ this.J3 * Math.sin(this.getState(x,     y - 1))
	+ this.J4 * Math.sin(this.getState(x + 1, y - 1))
      ) * (Math.sin(propState) - Math.sin(currState));

      if (energyDifference < 0) {
	// If the new configuration has less energy,
	// always change the state.
	this.states[this.X * y + x] = propState;
      } else {
	// If the new configuration has more energy,
	// change the state by the acceptance ratio.
	const acceptanceRatio = (
	  this.kT <= 0 ? 0 : Math.exp(-energyDifference / this.kT)
	);
	if (Math.random() < acceptanceRatio) {
	  this.states[this.X * y + x] = propState;
	}
      }
    }
  }

  calculateStatistics() {
    if (this.model === "ising") {
      let M = 0;
      let E = 0;
      for (let y = 0; y < this.Y; y++) {
	for (let x = 0; x < this.X; x++) {
	  M += this.states[this.X * y + x];
	  E += (
	    + this.J0 * this.getState(x,     y    )
	    + this.J1 * this.getState(x + 1, y    )
	    + this.J2 * this.getState(x + 1, y + 1)
	    + this.J3 * this.getState(x,     y + 1)
	    + this.J4 * Math.cos(this.getState(x - 1, y + 1))
	    + this.h
	  ) * this.states[this.X * y + x];
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
      const C = (U2Expval - UExpval ** 2) / this.kT ** 2;  // Actually C/k
      const chi = (M2Expval - MExpval ** 2) / this.kT;

      const MPerCell = M / (this.X * this.Y);
      const EPerCell = E / (this.X * this.Y);
      const CPerCell = C / (this.X * this.Y);
      const chiPerCell = chi / (this.X * this.Y);
      document.getElementById("M").innerText = MPerCell.toFixed(3);
      document.getElementById("E").innerText = EPerCell.toFixed(3);
      document.getElementById("C").innerText = (
	C ? CPerCell.toFixed(3) : "\u2014"
      );
      document.getElementById("chi").innerText = (
	chi ? chiPerCell.toFixed(3) : "\u2014"
      );

      return [EPerCell, MPerCell, CPerCell, chiPerCell];
    } else if (this.model === "xy") {
      let E = 0;
      for (let y = 0; y < this.Y; y++) {
	for (let x = 0; x < this.X; x++) {
	  const state = this.states[this.X * y + x];
	  E += (
	    + this.J0
	    + this.J1 * Math.cos(this.getState(x + 1, y    ) - state)
	    + this.J2 * Math.cos(this.getState(x + 1, y + 1) - state)
	    + this.J3 * Math.cos(this.getState(x,     y + 1) - state)
	    + this.J4 * Math.cos(this.getState(x - 1, y + 1) - state)
	  );
	}
      }

      this.EHistory.pop();
      this.EHistory.unshift(E);
      let UExpval = 0;
      let U2Expval = 0;
      for (let a = 0; a < this.A; a++) {
	UExpval += this.EHistory[a];
	U2Expval += this.EHistory[a] ** 2;
      }
      UExpval /= this.A;
      U2Expval /= this.A;
      const C = (U2Expval - UExpval ** 2) / this.kT ** 2;  // Actually C/k

      const EPerCell = E / (this.X * this.Y);
      const CPerCell = C / (this.X * this.Y);
      document.getElementById("xyE").innerText = EPerCell.toFixed(3);
      document.getElementById("xyC").innerText = (
	C ? CPerCell.toFixed(3) : "\u2014"
      );

      return [EPerCell, 0, CPerCell, 0];
    }
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

	  this.context.fillRect(x, y, 1, 1);
        } else if (this.model === "xy") {
	  const deg = this.states[this.X * y + x] * 180 / Math.PI;
	  this.context.fillStyle = `oklch(50% 75% ${deg}deg)`;

	  this.context.fillRect(x, y, 1, 1);

	  const s0 = this.getState(x,     y    );
	  const s1 = this.getState(x,     y + 1);
	  const s2 = this.getState(x + 1, y + 1);
	  const s3 = this.getState(x + 1, y    );
	  const vorticity = (
	    + spinDifference(s0, s1)
	    + spinDifference(s1, s2)
	    + spinDifference(s2, s3)
	    + spinDifference(s3, s0)
	  );

	  if (vorticity >= 0) {
	    const l = vorticity * 15;
	    this.vorticityContext.fillStyle = `oklch(${l}% ${l}% 0deg)`;
	  } else {
	    const l = -vorticity * 15;
	    this.vorticityContext.fillStyle = `oklch(${l}% ${l}% 180deg)`;
	  }

	  this.vorticityContext.fillRect(x, y, 1, 1);
        }
      }
    }
  }
}

function changeModelP(willRerender) {
  const modelP = document.getElementById("modelP")
  modelP.innerHTML = {
    ising: (
      "\\[\\begin{gathered} "
      + "E = \\sum_{\\substack{x \\ \\Delta x \\\\ y \\ \\Delta y}} "
      + "J_{\\substack{\\Delta x \\\\ \\Delta y}} \\, "
      + "s_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} \\, "
      + "s_{\\substack{x + \\Delta x \\\\ y + \\Delta y}} "
      + "+ h "
      + "\\sum_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} "
      + "s_{\\substack{x \\vphantom{\\Delta} \\\\ y \\vphantom{\\Delta}}} \\\\ "
      + "\\Big(s_{\\substack{x \\vphantom{\\Delta} \\\\ "
      + "y \\vphantom{\\Delta}}} = - 1, 1 \\Big) "
      + "\\end{gathered}\\]"
    ),
    xy: (
      "\\[\\begin{gathered} "
      + "E = \\sum_{\\substack{x \\ \\Delta x \\\\ y \\ \\Delta y}} "
      + "J_{\\substack{\\Delta x \\\\ \\Delta y}} \\cos ("
      + "\\theta_{\\substack{x + \\Delta x \\\\ y + \\Delta y}} "
      + "- \\theta_{\\substack{x \\vphantom{\\Delta} \\\\ "
      + "y \\vphantom{\\Delta}}}) \\\\ "
      + "\\Big(0 \\le \\theta_{\\substack{x \\vphantom{\\Delta} \\\\ "
      + "y \\vphantom{\\Delta}}} < 2 \\pi \\Big) "
      + "\\end{gathered}\\]"
    ),
  }[document.getElementById("model").value];
  if (willRerender) {
    renderMathInElement(modelP);
  }
}
changeModelP(false);

const model = new Model();

// I began to write this file as a hobby project.
// I did not use any AI tools to write this file.
