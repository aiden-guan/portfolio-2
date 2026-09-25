"use client";

import { type DragEvent, useId, useRef, useState } from "react";
import Image from "next/image";
import { MAX_PROJECT_IMAGES, type PortfolioImage } from "@/content/portfolio";

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
  onChange,
}: {
  images: PortfolioImage[];
  nameForAlt: string;
  onChange: (images: PortfolioImage[]) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const atLimit = images.length >= MAX_PROJECT_IMAGES;

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((file) => file.size > 0);
    if (incoming.length === 0) return;

    const room = MAX_PROJECT_IMAGES - images.length;
    if (room <= 0) {
      setError("A row holds six images.");
      return;
    }

    const accepted = incoming.slice(0, room);
    const leftOut = incoming.length - accepted.length;
    const next = [...images];
    setUploading(true);
    setError("");

    try {
      for (const file of accepted) {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/admin/media", { method: "POST", body });
        const payload: unknown = await response.json();

        if (!response.ok || !isUploadedImage(payload)) {
          setError(errorMessage(payload, "The image could not be added."));
          break;
        }

        const position = next.length + 1;
        next.push({
          src: payload.src,
          alt: position === 1 ? nameForAlt : `${nameForAlt} ${position}`,
        });
        onChange([...next]);
      }
    } catch {
      setError("The image could not be added.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (leftOut > 0) {
        setError((current) => current || "A row holds six images. Extra files were left out.");
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
          <h3>Images</h3>
          <p className="editor-hint editor-image-hint">
            They stay hidden until someone hovers the row, then slide out to the left. The last
            image sits on top. Save after uploading.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            id={inputId}
            className="editor-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
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
            {uploading ? "Adding…" : "Add images"}
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
          {images.map((image, index) => (
            <article className="editor-image-card" key={`${image.src}-${index}`}>
              <div className="editor-image-preview">
                <Image
                  alt=""
                  fill
                  sizes="160px"
                  src={image.src}
                  unoptimized={image.src.startsWith("/api/")}
                />
              </div>
              <label className="editor-field" htmlFor={`${inputId}-alt-${index}`}>
                <span className="editor-label">Description</span>
                <input
                  id={`${inputId}-alt-${index}`}
                  value={image.alt}
                  onChange={(event) =>
                    onChange(
                      images.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, alt: event.target.value } : item,
                      ),
                    )
                  }
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
          ))}
        </div>
      ) : (
        <p className="editor-empty-state">No images yet. Drop some here, or add them.</p>
      )}
    </div>
  );
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
