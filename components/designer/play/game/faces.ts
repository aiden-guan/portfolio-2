// Dialogue portraits for the people there's no photograph of: drawn on a
// 24 × 24 grid, one pixel at a time, in the same flat tones the dithered
// photo portraits come out in. Shown big with crisp edges.

type Face = {
  bg: string;
  skin?: string;
  hair?: string;
  hairStyle?: "short" | "messy" | "cap" | "grey" | "bald" | "long" | "buzz";
  cap?: string;
  shirt?: string;
  collar?: string;
  glasses?: boolean;
  mouth?: "smile" | "grin" | "flat" | "smirk";
  /** A rounder face: wider, fuller cheeks. */
  round?: boolean;
  icon?: "crown" | "question" | "phone" | "chatter" | "bird" | "heart";
};

const FACES: Record<string, Face> = {
  john: { bg: "#9cc0fa", skin: "#ecc39e", hair: "#161413", hairStyle: "short", shirt: "#4a6f9e", collar: "#f6f4ee", mouth: "smirk" },
  jerry: { bg: "#bfe3b4", skin: "#e2b28a", hair: "#2a2420", hairStyle: "messy", shirt: "#4f9a5c", collar: "#3f7d4a", mouth: "grin" },
  editor: { bg: "#f6c38b", skin: "#d09a70", hair: "#1d1a19", hairStyle: "cap", cap: "#d74718", shirt: "#1b1d22", mouth: "flat" },
  judge: { bg: "#e4dccd", skin: "#f0c9a8", hair: "#bfbab2", hairStyle: "grey", shirt: "#2a2f3d", collar: "#f6f4ee", glasses: true, mouth: "flat" },
  principal: { bg: "#cfd8f0", skin: "#b9805a", hair: "#2a2420", hairStyle: "bald", shirt: "#1b1d22", collar: "#2f6be8", glasses: true, mouth: "smile" },
  camper: { bg: "#fbe3cf", skin: "#d9a277", hair: "#4a3324", hairStyle: "messy", shirt: "#f08a32", collar: "#c06a22", mouth: "smile" },
  kingcop: { bg: "#2a1a1a", icon: "crown" },
  insider: { bg: "#1b2a4a", icon: "question" },
  phone: { bg: "#f6eedd", icon: "phone" },
  chatter: { bg: "#2a2f3d", icon: "chatter" },
  allen: { bg: "#ffe58a", skin: "#e9b98f", hair: "#161413", hairStyle: "short", shirt: "#ffd23f", collar: "#e6b800", glasses: true, mouth: "smile" },
  dylan: { bg: "#cdd2e0", skin: "#f0c9a8", hair: "#2a2420", hairStyle: "messy", shirt: "#2a2f3d", mouth: "grin" },
  samuel: { bg: "#c4d4e6", skin: "#d9a277", hair: "#1d1a19", hairStyle: "short", shirt: "#4f6b8a", collar: "#f6f4ee", mouth: "smirk" },
  floormate: { bg: "#f6d6b8", skin: "#d9a277", hair: "#4a3324", hairStyle: "messy", shirt: "#d74718", mouth: "smile" },
  floormate2: { bg: "#d8e8c8", skin: "#f3cfae", hair: "#2a2420", hairStyle: "long", shirt: "#8fd3b6", mouth: "grin" },
  professor: { bg: "#e4dccd", skin: "#f0c9a8", hair: "#bfbab2", hairStyle: "grey", shirt: "#6b5a45", collar: "#d9e6f2", glasses: true, mouth: "flat" },
  proctor: { bg: "#dfe4ec", skin: "#b9805a", hair: "#1d1a19", hairStyle: "buzz", shirt: "#1f3f8a", collar: "#f2c46b", mouth: "flat" },
  partner: { bg: "#e8e2d6", skin: "#e9b98f", hair: "#2a2420", hairStyle: "short", shirt: "#1b1d22", collar: "#f6f4ee", glasses: true, mouth: "flat" },
  partner2: { bg: "#e2e6ee", skin: "#b9805a", hair: "#1d1a19", hairStyle: "long", shirt: "#2a2f3d", collar: "#d9e6f2", mouth: "smile" },
  founder: { bg: "#d6dae4", skin: "#e2b28a", hair: "#4a3324", hairStyle: "messy", shirt: "#2a2f3d", collar: "#8a8f99", mouth: "grin" },
  founder2: { bg: "#e9d6e4", skin: "#b9805a", hair: "#1d1a19", hairStyle: "long", shirt: "#1b1d22", glasses: true, mouth: "smirk" },
  founder3: { bg: "#d8ecd0", skin: "#f3cfae", hair: "#c79a5b", hairStyle: "buzz", shirt: "#4f9a5c", mouth: "smile" },
  miles: { bg: "#d8d2ee", skin: "#e2b28a", hair: "#2a2420", hairStyle: "short", shirt: "#1b1d22", collar: "#f6f4ee", mouth: "smirk" },
  jun: { bg: "#cfe6d4", skin: "#e9b98f", hair: "#1d1a19", hairStyle: "cap", cap: "#2f7a4a", shirt: "#8a8f99", mouth: "grin", round: true },
  student: { bg: "#fbe3cf", skin: "#d9a277", hair: "#2a2420", hairStyle: "long", shirt: "#9cc0fa", mouth: "smile" },
  alai: { bg: "#fff3b8", icon: "bird" },
  dm: { bg: "#ffd6e2", icon: "heart" },
};

const cache = new Map<string, string>();

export function face(id: string) {
  const hit = cache.get(id);
  if (hit) return hit;
  const spec = FACES[id];
  if (!spec || typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const ctx = canvas.getContext("2d")!;
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  px(0, 0, 24, 24, spec.bg);
  // a little light in the corner, the way the photos have
  for (let y = 0; y < 24; y += 1) for (let x = 0; x < 24; x += 1) if ((x + y) % 4 === 0 && x + y < 14) px(x, y, 1, 1, "rgba(255,255,255,0.18)");

  if (spec.icon === "crown") {
    px(5, 9, 14, 7, "#f2c46b");
    px(5, 6, 2, 3, "#f2c46b");
    px(11, 5, 2, 4, "#f2c46b");
    px(17, 6, 2, 3, "#f2c46b");
    px(7, 8, 2, 1, "#f2c46b");
    px(15, 8, 2, 1, "#f2c46b");
    px(8, 12, 2, 2, "#d74718");
    px(14, 12, 2, 2, "#2f6be8");
    px(5, 16, 14, 2, "#c98f2c");
    px(4, 19, 16, 1, "#d74718");
    return store(id, canvas);
  }
  if (spec.icon === "question") {
    px(7, 6, 10, 12, "#0f1a33");
    px(5, 16, 14, 8, "#0f1a33");
    px(10, 8, 4, 1, "#9cc0fa");
    px(14, 9, 1, 2, "#9cc0fa");
    px(12, 11, 2, 1, "#9cc0fa");
    px(11, 12, 1, 2, "#9cc0fa");
    px(11, 15, 1, 1, "#9cc0fa");
    return store(id, canvas);
  }
  if (spec.icon === "phone") {
    px(7, 3, 10, 18, "#1b1d22");
    px(8, 5, 8, 13, "#9cc0fa");
    px(8, 5, 8, 2, "#2f6be8");
    px(11, 19, 2, 1, "#6d6b65");
    return store(id, canvas);
  }
  if (spec.icon === "bird") {
    // Ally, alai's little yellow bird
    px(6, 7, 12, 11, "#ffd23f");
    px(5, 9, 1, 7, "#ffd23f");
    px(18, 10, 2, 5, "#f2b800");
    px(9, 18, 6, 1, "#e6a800");
    px(13, 10, 2, 2, "#1d1a19");
    px(13, 10, 1, 1, "#ffffff");
    px(17, 12, 4, 2, "#f08a32");
    px(8, 13, 4, 3, "#f2b800");
    px(10, 19, 1, 2, "#f08a32");
    px(13, 19, 1, 2, "#f08a32");
    return store(id, canvas);
  }
  if (spec.icon === "heart") {
    px(6, 8, 5, 3, "#ff5f8f");
    px(13, 8, 5, 3, "#ff5f8f");
    px(5, 9, 14, 5, "#ff5f8f");
    px(6, 14, 12, 2, "#ff5f8f");
    px(8, 16, 8, 2, "#ff5f8f");
    px(10, 18, 4, 1, "#ff5f8f");
    px(7, 9, 2, 2, "#ffc2d4");
    return store(id, canvas);
  }
  if (spec.icon === "chatter") {
    px(4, 6, 16, 10, "#8a6cff");
    px(6, 16, 4, 3, "#8a6cff");
    px(8, 10, 2, 2, "#f6f4ee");
    px(14, 10, 2, 2, "#f6f4ee");
    return store(id, canvas);
  }

  const skin = spec.skin!, hair = spec.hair ?? "#1d1a19";
  const shade = "rgba(0,0,0,0.12)";
  // shoulders and collar
  px(3, 19, 18, 5, spec.shirt ?? "#2a2f3d");
  if (spec.collar) {
    px(9, 19, 6, 2, spec.collar);
    px(11, 21, 2, 1, spec.collar);
  }
  // neck, then the head
  px(10, 17, 4, 3, skin);
  px(10, 18, 4, 1, shade);
  px(6, 6, 12, 12, skin);
  px(7, 18, 10, 0, skin);
  px(5, 10, 1, 4, skin); // ears
  px(18, 10, 1, 4, skin);
  px(6, 16, 12, 2, shade);
  if (spec.round) {
    // fuller cheeks, a softer chin
    px(5, 12, 1, 5, skin);
    px(18, 12, 1, 5, skin);
    px(7, 18, 10, 1, skin);
    px(7, 18, 10, 1, shade);
    px(7, 14, 2, 1, "rgba(232, 138, 154, 0.45)");
    px(15, 14, 2, 1, "rgba(232, 138, 154, 0.45)");
  }
  // eyes
  px(8, 11, 2, 2, "#1d1a19");
  px(14, 11, 2, 2, "#1d1a19");
  px(8, 11, 1, 1, "#ffffff");
  px(14, 11, 1, 1, "#ffffff");
  if (spec.glasses) {
    ctx.strokeStyle = "#1b1d22";
    ctx.lineWidth = 1;
    ctx.strokeRect(7.5, 10.5, 4, 3);
    ctx.strokeRect(12.5, 10.5, 4, 3);
    px(11, 11, 2, 1, "#1b1d22");
  }
  // mouth
  const mouth = spec.mouth ?? "flat";
  if (mouth === "smile") {
    px(10, 15, 4, 1, "#9a4b3a");
    px(9, 14, 1, 1, "#9a4b3a");
    px(14, 14, 1, 1, "#9a4b3a");
  } else if (mouth === "grin") {
    px(9, 14, 6, 2, "#9a4b3a");
    px(10, 14, 4, 1, "#ffffff");
  } else if (mouth === "smirk") {
    px(10, 15, 4, 1, "#9a4b3a");
    px(14, 14, 1, 1, "#9a4b3a");
  } else px(10, 15, 4, 1, "#9a4b3a");
  // hair
  switch (spec.hairStyle) {
    case "short":
      px(6, 4, 12, 4, hair);
      px(5, 6, 2, 4, hair);
      px(17, 6, 2, 4, hair);
      px(8, 3, 9, 1, hair);
      px(13, 8, 4, 1, hair);
      break;
    case "messy":
      px(6, 4, 12, 4, hair);
      px(5, 5, 2, 5, hair);
      px(17, 5, 2, 5, hair);
      px(7, 2, 2, 2, hair);
      px(12, 2, 2, 2, hair);
      px(16, 3, 2, 1, hair);
      px(8, 8, 2, 1, hair);
      px(12, 8, 2, 1, hair);
      break;
    case "cap":
      px(5, 4, 14, 4, spec.cap ?? "#d74718");
      px(3, 7, 9, 2, spec.cap ?? "#d74718");
      px(5, 8, 2, 3, hair);
      px(17, 8, 2, 3, hair);
      break;
    case "grey":
      px(6, 5, 12, 2, hair);
      px(5, 6, 2, 5, hair);
      px(17, 6, 2, 5, hair);
      break;
    case "bald":
      px(5, 9, 1, 3, hair);
      px(18, 9, 1, 3, hair);
      px(9, 6, 4, 1, "rgba(255,255,255,0.25)");
      break;
    case "long":
      px(6, 4, 12, 4, hair);
      px(4, 6, 3, 14, hair);
      px(17, 6, 3, 14, hair);
      px(8, 3, 8, 1, hair);
      px(11, 7, 6, 2, hair);
      break;
    case "buzz":
      px(6, 5, 12, 2, hair);
      px(5, 6, 1, 4, hair);
      px(18, 6, 1, 4, hair);
      break;
  }
  return store(id, canvas);
}

function store(id: string, canvas: HTMLCanvasElement) {
  const url = canvas.toDataURL("image/png");
  cache.set(id, url);
  return url;
}
