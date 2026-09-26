"use client";

import { type DragEvent, type PointerEvent as ReactPointerEvent, useId, useRef, useState } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { imageFrame, isVideo, MAX_PROJECT_IMAGES, type PortfolioImage } from "@/content/portfolio";

const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  ...Object.keys(VIDEO_EXTENSIONS),
].join(",");

class UploadError extends Error {}

function errorMessage(payload: unknown, fallback: string) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

export function AdminImageEditor({
  images,
  nameForAlt,
  directUpload,
  onChange,
}: {
  images: PortfolioImage[];
  nameForAlt: string;
  // With Blob connected, videos upload straight from the browser, since they
  // outgrow the serverless request body limit.
  directUpload: boolean;
  onChange: (images: PortfolioImage[]) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const atLimit = images.length >= MAX_PROJECT_IMAGES;

  async function uploadVideo(file: File, extension: string) {
    const pathname = `portfolio/media/${crypto.randomUUID()}.${extension}`;
    const options = {
      handleUploadUrl: "/api/admin/media/upload",
      contentType: file.type,
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: ({ percentage }: { percentage: number }) =>
        setProgress(Math.round(percentage)),
    };

    try {
      const blob = await upload(pathname, file, { ...options, access: "public" });
      return blob.url;
    } catch (error) {
      if (!prefersPrivateStore(error)) throw error;
      await upload(pathname, file, { ...options, access: "private" });
      return `/api/media/${encodeURIComponent(pathname.split("/").pop() ?? "")}`;
    }
  }

  async function uploadFile(file: File) {
    const extension = VIDEO_EXTENSIONS[file.type];
    if (extension && file.size > MAX_VIDEO_BYTES) {
      throw new UploadError("Use a video under 100 MB.");
    }
    if (extension && directUpload) return uploadVideo(file, extension);

    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/admin/media", { method: "POST", body });
    const payload: unknown = await response.json();
    if (!response.ok || !isUploadedImage(payload)) {
      throw new UploadError(errorMessage(payload, "The file could not be added."));
    }
    return payload.src;
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((file) => file.size > 0);
    if (incoming.length === 0) return;

    const room = MAX_PROJECT_IMAGES - images.length;
    if (room <= 0) {
      setError("A row holds six items.");
      return;
    }

    const accepted = incoming.slice(0, room);
    const leftOut = incoming.length - accepted.length;
    const next = [...images];
    setUploading(true);
    setError("");

    try {
      for (const file of accepted) {
        setProgress(null);
        const src = await uploadFile(file);
        const position = next.length + 1;
        const item: PortfolioImage = {
          src,
          alt: position === 1 ? nameForAlt : `${nameForAlt} ${position}`,
          fit: "contain",
        };
        if (file.type in VIDEO_EXTENSIONS) item.kind = "video";
        next.push(item);
        onChange([...next]);
      }
    } catch (error) {
      setError(error instanceof UploadError ? error.message : "The file could not be added.");
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      if (leftOut > 0) {
        setError((current) => current || "A row holds six items. Extra files were left out.");
      }
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  function updateImage(index: number, patch: Partial<PortfolioImage>) {
    onChange(images.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function onPreviewPointerDown(event: ReactPointerEvent<HTMLDivElement>, index: number) {
    const image = images[index];
    if (!image || imageFrame(image).fit !== "cover") return;
    const preview = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = image.focusX ?? 50;
    const originY = image.focusY ?? 50;
    preview.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = preview.getBoundingClientRect();
      const dx = ((moveEvent.clientX - startX) / Math.max(rect.width, 1)) * 100;
      const dy = ((moveEvent.clientY - startY) / Math.max(rect.height, 1)) * 100;
      updateImage(index, {
        fit: "cover",
        focusX: clampPercent(originX - dx),
        focusY: clampPercent(originY - dy),
      });
    };
    const onUp = () => {
      preview.removeEventListener("pointermove", onMove);
      preview.removeEventListener("pointerup", onUp);
    };
    preview.addEventListener("pointermove", onMove);
    preview.addEventListener("pointerup", onUp);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    void addFiles(event.dataTransfer.files);
  }

  return (
    <div
      className={`editor-subsection editor-images${dragging ? " is-dropping" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="editor-subsection-heading">
        <div>
          <h3>Images and videos</h3>
          <p className="editor-hint editor-image-hint">
            Uploads keep their full frame. Choose Fill card if you want to crop one, then drag
            it to set what stays visible. The last item sits on top. Videos play muted in the
            viewer, up to 100 MB. Save after editing.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            id={inputId}
            className="editor-file-input"
            type="file"
            accept={ACCEPT}
            multiple
            disabled={uploading || atLimit}
            tabIndex={-1}
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
            }}
          />
          <button
            className="editor-button editor-button-small"
            type="button"
            disabled={uploading || atLimit}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (progress === null ? "Adding…" : `Adding… ${progress}%`) : "Add media"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="editor-status editor-status-error" role="alert">
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <div className="editor-image-grid">
          {images.map((image, index) => {
            const frame = imageFrame(image);
            return (
            <article className="editor-image-card" key={`${image.src}-${index}`}>
              <div
                className={`editor-image-preview${frame.fit === "cover" ? " is-movable" : ""}`}
                onPointerDown={(event) => onPreviewPointerDown(event, index)}
              >
                {isVideo(image) ? (
                  <video
                    muted
                    playsInline
                    preload="metadata"
                    src={`${image.src}#t=0.001`}
                    style={{ objectFit: frame.fit, objectPosition: frame.position }}
                  />
                ) : (
                  <Image
                    alt=""
                    fill
                    sizes="160px"
                    src={image.src}
                    style={{ objectFit: frame.fit, objectPosition: frame.position }}
                    unoptimized={image.src.startsWith("/api/")}
                  />
                )}
              </div>
              <div className="editor-fit-toggle" role="group" aria-label={`Framing for image ${index + 1}`}>
                <button
                  className="editor-button editor-button-small"
                  type="button"
                  aria-pressed={frame.fit === "contain"}
                  onClick={() => updateImage(index, { fit: "contain" })}
                >
                  Whole frame
                </button>
                <button
                  className="editor-button editor-button-small"
                  type="button"
                  aria-pressed={frame.fit === "cover"}
                  onClick={() => updateImage(index, { fit: "cover" })}
                >
                  Fill card
                </button>
              </div>
              <p className="editor-image-note">
                {frame.fit === "cover"
                  ? `Drag the ${isVideo(image) ? "video" : "photo"} to set the crop.`
                  : `The full ${isVideo(image) ? "video" : "photo"} stays visible.`}
              </p>
              <label className="editor-field" htmlFor={`${inputId}-alt-${index}`}>
                <span className="editor-label">Description</span>
                <input
                  id={`${inputId}-alt-${index}`}
                  value={image.alt}
                  onChange={(event) => updateImage(index, { alt: event.target.value })}
                />
              </label>
              <div className="editor-image-actions">
                <button
                  className="editor-icon-button"
                  type="button"
                  aria-label="Move image earlier"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ←
                </button>
                <button
                  className="editor-icon-button"
                  type="button"
                  aria-label="Move image later"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, 1)}
                >
                  →
                </button>
                <button
                  className="editor-icon-button"
                  type="button"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}
                >
                  ×
                </button>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <p className="editor-empty-state">No images or videos yet. Drop some here, or add them.</p>
      )}
    </div>
  );
}

function prefersPrivateStore(error: unknown) {
  return (
    error instanceof Error &&
    /public/i.test(error.message) &&
    /access|private|not allowed/i.test(error.message)
  );
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function isUploadedImage(value: unknown): value is { src: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "src" in value &&
    typeof value.src === "string" &&
    value.src.length > 0
  );
}
