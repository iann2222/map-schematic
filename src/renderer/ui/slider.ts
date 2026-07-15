export type SliderControl = {
  root: HTMLDivElement;
  track: HTMLDivElement;
  fill: HTMLDivElement;
  thumb: HTMLDivElement;
  marks: HTMLDivElement;
  min: number;
  max: number;
  step: number;
  value: number;
  dragging: boolean;
  rect: DOMRect | null;
  marksValues: number[] | null;
  marksPercents: number[] | null;
  defaultIndex: number | null;
  onChange: (value: number) => void;
};

export function initSlider(
  root: HTMLDivElement | null,
  initialValue: number,
  onChange: (value: number) => void
): SliderControl | null {
  if (!root) {
    return null;
  }
  const track = root.querySelector(".slider-track") as HTMLDivElement | null;
  const fill = root.querySelector(".slider-fill") as HTMLDivElement | null;
  const thumb = root.querySelector(".slider-thumb") as HTMLDivElement | null;
  const marks = root.querySelector(".slider-marks") as HTMLDivElement | null;
  if (!track || !fill || !thumb || !marks) {
    return null;
  }
  const control: SliderControl = {
    root,
    track,
    fill,
    thumb,
    marks,
    min: Number(root.dataset.min || "0"),
    max: Number(root.dataset.max || "100"),
    step: Number(root.dataset.step || "1"),
    value: initialValue,
    dragging: false,
    rect: null,
    marksValues: null,
    marksPercents: null,
    defaultIndex: root.dataset.defaultIndex
      ? Math.max(0, Number(root.dataset.defaultIndex))
      : null,
    onChange
  };
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    control.dragging = true;
    control.rect = control.track.getBoundingClientRect();
    control.root.classList.add("dragging");
    control.root.setPointerCapture(event.pointerId);
    updateSliderFromPointer(control, event.clientX);
  });
  root.addEventListener("pointermove", (event) => {
    if (control.dragging) {
      updateSliderFromPointer(control, event.clientX);
    }
  });
  root.addEventListener("pointerup", (event) => {
    if (!control.dragging) {
      return;
    }
    control.dragging = false;
    control.root.classList.remove("dragging");
    control.root.releasePointerCapture(event.pointerId);
  });
  root.addEventListener("pointercancel", () => {
    control.dragging = false;
    control.root.classList.remove("dragging");
  });
  thumb.addEventListener("keydown", (event) => {
    let nextValue = control.value;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextValue += control.step;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextValue -= control.step;
    } else if (event.key === "Home") {
      nextValue = control.min;
    } else if (event.key === "End") {
      nextValue = control.max;
    } else {
      return;
    }
    event.preventDefault();
    setSliderValue(control, nextValue);
  });
  renderSliderMarks(control);
  if (control.marksValues && control.defaultIndex != null) {
    const index = Math.min(
      control.marksValues.length - 1,
      Math.max(0, control.defaultIndex)
    );
    control.value = control.marksValues[index];
  }
  updateSliderUI(control);
  return control;
}

function updateSliderFromPointer(control: SliderControl, clientX: number): void {
  if (!control.rect) {
    control.rect = control.track.getBoundingClientRect();
  }
  const ratio = (clientX - control.rect.left) / control.rect.width;
  const clamped = Math.max(0, Math.min(1, ratio));
  const raw = control.min + clamped * (control.max - control.min);
  setSliderValue(control, snapSliderValue(control, raw));
}

function snapSliderValue(control: SliderControl, raw: number): number {
  if (!Number.isFinite(raw)) {
    return control.value;
  }
  if (control.marksValues && control.marksValues.length > 1) {
    let nearest = control.marksValues[0];
    let best = Math.abs(raw - nearest);
    for (const value of control.marksValues) {
      const distance = Math.abs(raw - value);
      if (distance < best) {
        best = distance;
        nearest = value;
      }
    }
    return Math.max(control.min, Math.min(control.max, nearest));
  }
  const index = Math.round((raw - control.min) / control.step);
  return Math.max(
    control.min,
    Math.min(control.max, control.min + index * control.step)
  );
}

export function setSliderValue(
  control: SliderControl,
  value: number,
  silent = false
): void {
  const clamped = Math.max(control.min, Math.min(control.max, value));
  const next = snapSliderValue(control, clamped);
  if (next === control.value && !silent) {
    return;
  }
  control.value = next;
  updateSliderUI(control);
  if (!silent) {
    control.onChange(next);
  }
}

export function updateSliderUI(control: SliderControl): void {
  let percent = 0;
  if (control.marksValues && control.marksPercents) {
    let nearestIndex = 0;
    let best = Math.abs(control.value - control.marksValues[0]);
    control.marksValues.forEach((value, index) => {
      const distance = Math.abs(control.value - value);
      if (distance < best) {
        best = distance;
        nearestIndex = index;
      }
    });
    percent = (control.marksPercents[nearestIndex] ?? 0) * 100;
  } else {
    const ratio = (control.value - control.min) / (control.max - control.min);
    percent = Math.max(0, Math.min(1, ratio)) * 100;
  }
  control.thumb.style.left = `${percent}%`;
  control.fill.style.width = `${percent}%`;
  control.thumb.setAttribute("role", "slider");
  control.thumb.setAttribute("aria-valuemin", String(control.min));
  control.thumb.setAttribute("aria-valuemax", String(control.max));
  control.thumb.setAttribute("aria-valuenow", String(control.value));
  Array.from(control.marks.children).forEach((mark) => {
    const element = mark as HTMLDivElement;
    const markValue = Number(element.dataset.value || "0");
    element.classList.toggle("active", markValue <= control.value);
  });
}

function renderSliderMarks(control: SliderControl): void {
  control.marks.innerHTML = "";
  control.marksValues = null;
  control.marksPercents = null;
  const marksCountRaw = control.root.dataset.marks;
  const marksCount = marksCountRaw ? Math.max(2, Number(marksCountRaw)) : 0;
  const count = marksCount
    ? marksCount - 1
    : Math.max(1, Math.round((control.max - control.min) / control.step));
  const values: number[] = [];
  const percents: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    const ratio = count === 0 ? 0 : index / count;
    const value = snapSliderValue(
      control,
      control.min + ratio * (control.max - control.min)
    );
    values.push(value);
    percents.push(ratio);
    const mark = document.createElement("div");
    mark.className = "slider-mark";
    mark.dataset.value = String(value);
    mark.style.left = `${ratio * 100}%`;
    const tick = document.createElement("div");
    tick.className = "tick";
    mark.appendChild(tick);
    control.marks.appendChild(mark);
  }
  control.marksValues = values;
  control.marksPercents = percents;
}
