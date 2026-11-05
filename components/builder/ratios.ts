// Width over height of the pictures in public/projects that are wider than
// the 16:10 frame they're shown in. Those are drawn to the frame's height and
// cropped at the sides, so on screen they're wider than the frame and need a
// bigger file to stay sharp. Measured from the files; a picture that isn't
// listed is taken to fit its frame, which only ever costs a little sharpness.
export const RATIO: Record<string, number> = {
  agenthub: 2,
  agnotify: 2,
  continuity: 2.21,
  courtvision: 2,
  "courtvision-shots": 2.15,
  inroad: 2,
  pigeonbox: 1.78,
  "pigeonbox-app": 1.78,
  seyrin: 1.78,
  "seyrin-doc": 1.78,
  startupsim: 1.83,
};
