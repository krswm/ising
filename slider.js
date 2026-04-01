// Synchronize sliders.

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

// Not gen AI generated.
