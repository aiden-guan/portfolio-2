"use client";

import { useCallback, useEffect, useState } from "react";

type R2StatusData = {
  provider: string;
  configured: boolean;
  hardBlockerActive: boolean;
  totalBytes: number;
  objectCount: number;
  safetyCapBytes: number;
  freeTierBytes: number;
  maxFilesCap: number;
  percentOfSafetyCap: number;
  percentOfFreeTier: number;
  orphanedCount: number;
  orphanedBytes: number;
  freeTierLimits?: {
    storageGb: number;
    classAOpsMonthly: number;
    classBOpsMonthly: number;
    egress: string;
  };
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function AdminStorageGuard() {
  const [data, setData] = useState<R2StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/media/status", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load storage status");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error checking storage status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  async function handleClean() {
    setCleaning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/media/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clean-orphaned" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to clean orphaned media");

      if (result.deletedCount === 0) {
        setMessage("No orphaned media found. Bucket is clean!");
      } else {
        setMessage(`Cleaned ${result.deletedCount} orphaned file(s) and freed ${formatBytes(result.freedBytes)}!`);
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleaning failed");
    } finally {
      setCleaning(false);
    }
  }

  if (loading) {
    return <p className="editor-empty-state">Checking Cloudflare R2 storage usage and safety limits…</p>;
  }

  if (!data?.configured) {
    return (
      <div className="editor-card editor-card-compact">
        <p className="editor-empty-state">Cloudflare R2 is not configured in this environment.</p>
      </div>
    );
  }

  const safetyCapGb = (data.safetyCapBytes / (1024 * 1024 * 1024)).toFixed(1);
  const percentCapped = Math.min(100, Math.max(0.5, data.percentOfSafetyCap));
  const isHighUsage = data.percentOfSafetyCap > 80;

  return (
    <div className="editor-card editor-card-compact" style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <span style={{ fontSize: "0.75rem", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)", fontWeight: 600 }}>
            🛡️ Hard Blocker Active
          </span>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--ink)", fontWeight: 500 }}>
            Cloudflare R2 Storage Protection
          </p>
        </div>
        <button
          type="button"
          className="editor-button editor-button-small"
          onClick={() => void loadStatus()}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Progress Bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
          <span>Storage Used: <strong style={{ color: "var(--ink)" }}>{formatBytes(data.totalBytes)}</strong></span>
          <span>Safety Cap: <strong style={{ color: "var(--ink)" }}>{safetyCapGb} GB</strong> (Free Tier: 10 GB)</span>
        </div>
        <div style={{ width: "100%", height: "8px", background: "var(--rule)", borderRadius: "4px", overflow: "hidden" }}>
          <div
            style={{
              width: `${percentCapped}%`,
              height: "100%",
              background: isHighUsage ? "var(--accent)" : "var(--ink)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--faint)", marginTop: "0.25rem" }}>
          <span>{data.percentOfSafetyCap.toFixed(2)}% of hard safety limit</span>
          <span>{data.percentOfFreeTier.toFixed(2)}% of Cloudflare 10 GB allowance</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", padding: "0.75rem", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "2px" }}>
        <div>
          <span style={{ display: "block", fontSize: "0.65rem", textTransform: "uppercase", color: "var(--faint)", fontFamily: "var(--mono)" }}>Total Files</span>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--ink)" }}>{data.objectCount} / {data.maxFilesCap}</span>
        </div>
        <div>
          <span style={{ display: "block", fontSize: "0.65rem", textTransform: "uppercase", color: "var(--faint)", fontFamily: "var(--mono)" }}>Orphaned Files</span>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: data.orphanedCount > 0 ? "var(--accent)" : "var(--ink)" }}>
            {data.orphanedCount} ({formatBytes(data.orphanedBytes)})
          </span>
        </div>
        <div>
          <span style={{ display: "block", fontSize: "0.65rem", textTransform: "uppercase", color: "var(--faint)", fontFamily: "var(--mono)" }}>Egress & Bandwidth</span>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--ink)" }}>$0 / Free</span>
        </div>
      </div>

      {/* Actions and messages */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <button
          type="button"
          className="editor-button editor-button-small"
          disabled={cleaning || data.orphanedCount === 0}
          onClick={() => void handleClean()}
        >
          {cleaning ? "Cleaning..." : data.orphanedCount > 0 ? `Clean ${data.orphanedCount} orphaned file(s)` : "No orphaned files"}
        </button>

        {message ? (
          <span style={{ fontSize: "0.75rem", color: "var(--ink)" }}>{message}</span>
        ) : null}
        {error ? (
          <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>{error}</span>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--faint)", lineHeight: 1.5 }}>
        Hard blockers are enforced on all image and video uploads: if an upload would cause total storage to exceed {safetyCapGb} GB, it is rejected immediately on the server before transferring bytes. Presigned video upload URLs cryptographically lock the exact file size so oversized files cannot be written to R2.
      </p>
    </div>
  );
}
