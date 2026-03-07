// Synchronize sliders.

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

// Not gen AI generated.
