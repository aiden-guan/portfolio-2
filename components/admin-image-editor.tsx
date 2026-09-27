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
const VIDEO_TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const UPLOAD_PREPARATION_TIMEOUT_MS = 60 * 1000;
const IMAGE_UPLOAD_TIMEOUT_MS = 60 * 1000;
const VIDEO_UPLOAD_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  ...Object.keys(VIDEO_EXTENSIONS),
  ...Object.keys(VIDEO_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
].join(",");

class UploadError extends Error {}

type UploadProgressState = {
  kind: "image" | "video";
  phase: "preparing" | "uploading" | "finishing";
  percentage: number | null;
};

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
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const atLimit = images.length >= MAX_PROJECT_IMAGES;

  async function uploadVideo(file: File, extension: string, contentType: string) {
    const pathname = `portfolio/media/${crypto.randomUUID()}.${extension}`;
    const controller = new AbortController();
    let uploadStarted = false;
    let rejectTimeout: (error: UploadError) => void = () => undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      rejectTimeout = (error) => reject(error);
    });
    let timeout = 0;
    const armTimeout = (duration: number) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        controller.abort();
        rejectTimeout(
          new UploadError(
            uploadStarted
              ? "The upload stalled. Check your connection and try again."
              : "The upload could not start. Check your connection and try again.",
          ),
        );
      }, duration);
    };
    setUploadProgress({ kind: "video", phase: "preparing", percentage: null });
    armTimeout(UPLOAD_PREPARATION_TIMEOUT_MS);
    const options = {
      handleUploadUrl: "/api/admin/media/upload",
      contentType,
      multipart: file.size > 8 * 1024 * 1024,
      abortSignal: controller.signal,
      onUploadProgress: ({ percentage }: { percentage: number }) => {
        uploadStarted = true;
        const currentPercentage = clampPercent(percentage);
        setUploadProgress({
          kind: "video",
          phase: currentPercentage >= 100 ? "finishing" : "uploading",
          percentage: currentPercentage,
        });
        armTimeout(VIDEO_UPLOAD_IDLE_TIMEOUT_MS);
      },
    };
    const uploadWithTimeout = (access: "public" | "private") =>
      Promise.race([upload(pathname, file, { ...options, access }), timeoutPromise]);

    try {
      try {
        const blob = await uploadWithTimeout("public");
        return blob.url;
      } catch (error) {
        if (!prefersPrivateStore(error)) throw error;
        uploadStarted = false;
        setUploadProgress({ kind: "video", phase: "preparing", percentage: null });
        armTimeout(UPLOAD_PREPARATION_TIMEOUT_MS);
        await uploadWithTimeout("private");
        return `/api/media/${encodeURIComponent(pathname.split("/").pop() ?? "")}`;
      }
    } catch (error) {
      if (error instanceof UploadError) throw error;
      if (controller.signal.aborted) {
        const message = uploadStarted
          ? "The upload stalled. Check your connection and try again."
          : "The upload could not start. Check your connection and try again.";
        throw new UploadError(message);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function uploadFile(file: File) {
    const videoType = videoTypeForFile(file);
    const extension = videoType ? VIDEO_EXTENSIONS[videoType] : undefined;
    if (extension && file.size > MAX_VIDEO_BYTES) {
      throw new UploadError("Use a video under 100 MB.");
    }
    if (extension && videoType && directUpload) {
      return uploadVideo(file, extension, videoType);
    }

    const body = new FormData();
    body.set(
      "file",
      videoType && file.type.trim().toLowerCase() !== videoType
        ? new File([file], file.name, { type: videoType })
        : file,
    );
    const kind = videoType ? "video" : "image";
    setUploadProgress({ kind, phase: "uploading", percentage: 0 });
    return uploadMediaForm(body, kind, (percentage) => {
      setUploadProgress({
        kind,
        phase: percentage >= 100 ? "finishing" : "uploading",
        percentage,
      });
    });
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
        setUploadProgress(null);
        const src = await uploadFile(file);
        const position = next.length + 1;
        const kind = videoTypeForFile(file) ? "video" : "image";
        setUploadProgress({ kind, phase: "finishing", percentage: 100 });
        const item: PortfolioImage = {
          src,
          alt: position === 1 ? nameForAlt : `${nameForAlt} ${position}`,
          fit: "contain",
        };
        if (videoTypeForFile(file)) item.kind = "video";
        next.push(item);
        onChange([...next]);
      }
    } catch (error) {
      setError(uploadErrorMessage(error));
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
            viewer, up to 100 MB. MP4, M4V, WebM, and MOV are supported. Save after editing.
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
            {uploading
              ? uploadProgress?.phase === "preparing"
                ? "Preparing video…"
                : "Adding…"
              : "Add media"}
          </button>
        </div>
      </div>

      {uploading && uploadProgress ? (
        <div className="editor-upload-progress">
          <div className="editor-upload-progress-label">
            <span>
              {uploadProgress.phase === "preparing"
                ? "Preparing video upload…"
                : uploadProgress.phase === "finishing"
                  ? `Finishing ${uploadProgress.kind} upload…`
                  : `Uploading ${uploadProgress.kind}`}
            </span>
            {uploadProgress.percentage !== null && uploadProgress.phase !== "preparing" ? (
              <span>{uploadProgress.percentage}%</span>
            ) : null}
          </div>
          <progress
            className="editor-upload-progress-bar"
            max={100}
            value={uploadProgress.phase === "preparing" ? undefined : uploadProgress.percentage ?? undefined}
            aria-label={`${uploadProgress.phase === "preparing" ? "Preparing" : "Uploading"} ${uploadProgress.kind}`}
          />
        </div>
      ) : null}

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

function uploadMediaForm(
  body: FormData,
  kind: UploadProgressState["kind"],
  onProgress: (percentage: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const isVideo = kind === "video";
    let settled = false;
    let progressSeen = false;
    let timeout = 0;

    const clearUploadTimeout = () => window.clearTimeout(timeout);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearUploadTimeout();
      reject(error);
    };
    const armTimeout = (duration: number) => {
      clearUploadTimeout();
      timeout = window.setTimeout(() => {
        fail(
          new UploadError(
            isVideo
              ? progressSeen
                ? "The upload stalled. Check your connection and try again."
                : "The upload could not start. Check your connection and try again."
              : "The upload took too long. Check your connection and try again.",
          ),
        );
        request.abort();
      }, duration);
    };

    request.open("POST", "/api/admin/media");
    request.responseType = "text";
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      progressSeen = progressSeen || event.loaded > 0;
      onProgress(clampPercent((event.loaded / event.total) * 100));
      armTimeout(isVideo ? VIDEO_UPLOAD_IDLE_TIMEOUT_MS : IMAGE_UPLOAD_TIMEOUT_MS);
    });
    request.addEventListener("load", () => {
      let payload: unknown;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      if (request.status < 200 || request.status >= 300 || !isUploadedImage(payload)) {
        fail(new UploadError(errorMessage(payload, "The file could not be added.")));
        return;
      }

      if (settled) return;
      settled = true;
      clearUploadTimeout();
      resolve(payload.src);
    });
    request.addEventListener("error", () => {
      fail(new TypeError("The upload server could not be reached."));
    });
    request.addEventListener("abort", () => {
      fail(new UploadError("The upload was interrupted. Try again."));
    });

    armTimeout(isVideo ? UPLOAD_PREPARATION_TIMEOUT_MS : IMAGE_UPLOAD_TIMEOUT_MS);
    try {
      request.send(body);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("The file could not be added."));
    }
  });
}

function prefersPrivateStore(error: unknown) {
  return (
    error instanceof Error &&
    /public/i.test(error.message) &&
    /access|private|not allowed/i.test(error.message)
  );
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof UploadError) return error.message;
  if (error instanceof Error && /client token/i.test(error.message)) {
    return "The server could not prepare this video upload. Check the video storage configuration and try again.";
  }
  if (error instanceof TypeError) {
    return "The upload server could not be reached. Check your connection and try again.";
  }
  return "The file could not be added.";
}

function videoTypeForFile(file: Pick<File, "name" | "type">) {
  const declaredType = file.type.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(VIDEO_EXTENSIONS, declaredType)) return declaredType;

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? VIDEO_TYPES_BY_EXTENSION[extension] ?? null : null;
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
