// Shared with the edge field, written from the scroll loop. Not React state:
// the canvas reads it every frame and the page does not re-render to match.
export const breakSignal = {
  spread: 0,
  fracture: 0,
  live: false,
  reduced: false,
};
