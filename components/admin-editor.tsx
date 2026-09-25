"use client";

import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import Link from "next/link";
import { AdminImageEditor } from "@/components/admin-image-editor";
import type {
  PortfolioContent,
  ProfileLink,
  Project,
  TimelineEntry,
} from "@/content/portfolio";

type EditorTab = "profile" | "projects" | "experience" | "about" | "settings";

const tabs: { id: EditorTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "projects", label: "Work" },
  { id: "experience", label: "Experience" },
  { id: "about", label: "About" },
  { id: "settings", label: "Settings" },
];

function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "email" | "password" | "text" | "url";
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) {
  const id = useId();

  return (
    <label className="editor-field" htmlFor={id}>
      <span className="editor-label">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint ? <span className="editor-hint">{hint}</span> : null}
    </label>
  );
}

function EditorSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="editor-section">
      <div className="editor-section-heading">
        <p className="editor-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function emptyProject(): Project {
  return {
    name: "New project",
    status: "In progress",
    summary: "A short description.",
    detail: "What it does and why it matters.",
    stack: ["React"],
    links: [],
    images: [],
  };
}

function emptyTimelineEntry(): TimelineEntry {
  return {
    organization: "Organization",
    role: "Role",
    period: "Now",
    summary: "What you did.",
    images: [],
  };
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const reordered = [...items];
  const item = reordered[fromIndex];

  if (item === undefined) return items;

  reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, item);
  return reordered;
}

function readDragIndex(event: DragEvent<HTMLElement>, listId: string) {
  const payload = event.dataTransfer.getData("application/x-portfolio-order");
  const [payloadListId, payloadIndex] = payload.split(":");

  if (payloadListId !== listId) return null;

  const index = Number(payloadIndex);
  return Number.isInteger(index) ? index : null;
}

function OrderControls({
  listId,
  index,
  itemCount,
  label,
  onReorder,
  showDragHandle = true,
}: {
  listId: string;
  index: number;
  itemCount: number;
  label: string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  showDragHandle?: boolean;
}) {
  return (
    <div className="editor-order-controls">
      {showDragHandle ? (
        <button
          className="editor-order-handle"
          type="button"
          draggable
          aria-label={`Drag ${label} to reorder`}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-portfolio-order",
              `${listId}:${index}`,
            );
          }}
        >
          ↕
        </button>
      ) : null}
      <button
        className="editor-icon-button"
        type="button"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onReorder(index, index - 1)}
      >
        ↑
      </button>
      <button
        className="editor-icon-button"
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === itemCount - 1}
        onClick={() => onReorder(index, index + 1)}
      >
        ↓
      </button>
    </div>
  );
}

function SortableDropTarget({
  listId,
  index,
  className,
  children,
  onReorder,
}: {
  listId: string;
  index: number;
  className: string;
  children: ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  return (
    <article
      className={`${className}${isDropTarget ? " is-drop-target" : ""}`}
      onDragOver={(event) => {
        if (readDragIndex(event, listId) === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        event.preventDefault();
        const fromIndex = readDragIndex(event, listId);
        if (fromIndex !== null) onReorder(fromIndex, index);
        setIsDropTarget(false);
      }}
    >
      {children}
    </article>
  );
}

function StackEditor({
  listId,
  stack,
  onChange,
}: {
  listId: string;
  stack: string[];
  onChange: (stack: string[]) => void;
}) {
  function handleDragStart(event: DragEvent<HTMLDivElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-portfolio-order", `${listId}:${index}`);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    const fromIndex = readDragIndex(event, listId);
    if (fromIndex !== null) onChange(reorderItems(stack, fromIndex, index));
  }

  return (
    <div className="editor-stack-editor">
      <div className="editor-subsection-heading">
        <div className="editor-stack-heading">
          <h3>Tech stack</h3>
        </div>
        <button
          className="editor-button editor-button-small"
          type="button"
          onClick={() => onChange([...stack, "New technology"])}
        >
          + Add item
        </button>
      </div>
      {stack.length > 0 ? (
        <div className="editor-repeater editor-stack-list">
          {stack.map((item, itemIndex) => (
            <div
              className="editor-stack-row"
              draggable
              key={`stack-${itemIndex}`}
              onDragOver={(event) => {
                if (readDragIndex(event, listId) === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragStart={(event) => handleDragStart(event, itemIndex)}
              onDrop={(event) => handleDrop(event, itemIndex)}
            >
              <Field
                label={`Item ${itemIndex + 1}`}
                value={item}
                onChange={(value) =>
                  onChange(stack.map((currentItem, index) => (index === itemIndex ? value : currentItem)))
                }
              />
              <button
                className="editor-icon-button"
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(stack.filter((_, index) => index !== itemIndex))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="editor-empty-state">No technologies added yet.</p>
      )}
    </div>
  );
}

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

export function AdminEditor() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [content, setContent] = useState<PortfolioContent | null>(null);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<EditorTab>("profile");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"quiet" | "error" | "success">("quiet");
  const [saving, setSaving] = useState(false);

  const loadContent = useCallback(async () => {
    const response = await fetch("/api/admin/content", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(errorMessage(payload, "The portfolio could not be loaded."));
    }

    setContent(payload.content);
    setConfigured(payload.storageConfigured !== false);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      const payload = await response.json();
      setConfigured(payload.configured !== false);

      if (payload.authenticated) {
        setAuthenticated(true);
        await loadContent();
      }
    } catch {
      setStatus("The editor could not connect to the server.");
      setStatusTone("error");
    } finally {
      setLoading(false);
    }
  }, [loadContent]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSession(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSession]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setStatusTone("quiet");

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setStatus(errorMessage(payload, "The password was not accepted."));
        setStatusTone("error");
        return;
      }

      setAuthenticated(true);
      setPassword("");
      await loadContent();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The editor could not connect.");
      setStatusTone("error");
    }
  }

  async function saveContent() {
    if (!content || !configured) return;

    setSaving(true);
    setStatus("");
    setStatusTone("quiet");

    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      const payload = await response.json();

      if (!response.ok) {
        setStatus(errorMessage(payload, "The portfolio could not be saved."));
        setStatusTone("error");
        return;
      }

      setContent(payload.content);
      setStatus("Saved. The public portfolio now uses these changes.");
      setStatusTone("success");
    } catch {
      setStatus("The portfolio could not be saved.");
      setStatusTone("error");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthenticated(false);
    setContent(null);
    setStatus("");
  }

  function updateProfile(key: keyof PortfolioContent["profile"], value: string) {
    setContent((current) =>
      current
        ? { ...current, profile: { ...current.profile, [key]: value } }
        : current,
    );
  }

  function updateProfileLink(index: number, patch: Partial<ProfileLink>) {
    setContent((current) => {
      if (!current) return current;
      const links = current.profile.links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      );
      return { ...current, profile: { ...current.profile, links } };
    });
  }

  function updateProject(index: number, patch: Partial<Project>) {
    setContent((current) => {
      if (!current) return current;
      const projects = current.projects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, ...patch } : project,
      );
      return { ...current, projects };
    });
  }

  function updateProjectLink(
    projectIndex: number,
    linkIndex: number,
    patch: Partial<Project["links"][number]>,
  ) {
    setContent((current) => {
      if (!current) return current;
      const projects = current.projects.map((project, currentProjectIndex) => {
        if (currentProjectIndex !== projectIndex) return project;
        const links = project.links.map((link, currentLinkIndex) =>
          currentLinkIndex === linkIndex ? { ...link, ...patch } : link,
        );
        return { ...project, links };
      });
      return { ...current, projects };
    });
  }

  function updateTimeline(index: number, patch: Partial<TimelineEntry>) {
    setContent((current) => {
      if (!current) return current;
      const timeline = current.timeline.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      );
      return { ...current, timeline };
    });
  }

  function reorderProjects(fromIndex: number, toIndex: number) {
    setContent((current) =>
      current
        ? { ...current, projects: reorderItems(current.projects, fromIndex, toIndex) }
        : current,
    );
  }

  function reorderTimeline(fromIndex: number, toIndex: number) {
    setContent((current) =>
      current
        ? { ...current, timeline: reorderItems(current.timeline, fromIndex, toIndex) }
        : current,
    );
  }

  function reorderParagraphs(fromIndex: number, toIndex: number) {
    setContent((current) =>
      current
        ? {
            ...current,
            about: {
              paragraphs: reorderItems(current.about.paragraphs, fromIndex, toIndex),
            },
          }
        : current,
    );
  }

  function reorderInterests(fromIndex: number, toIndex: number) {
    setContent((current) =>
      current
        ? { ...current, interests: reorderItems(current.interests, fromIndex, toIndex) }
        : current,
    );
  }

  if (loading) {
    return (
      <main className="editor-shell editor-loading">
        <p className="editor-eyebrow">Private editor</p>
        <p>Loading…</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="editor-shell editor-login">
        <Link className="editor-back-link" href="/">
          ← View portfolio
        </Link>
        <div className="editor-login-card">
          <p className="editor-eyebrow">Private editor</p>
          <h1>Edit the portfolio.</h1>
          <p>Sign in to update the public copy, projects, and experience.</p>
          {!configured ? (
            <p className="editor-notice editor-notice-error">
              Admin access is not configured yet. Add <code>ADMIN_PASSWORD</code> in Vercel first.
            </p>
          ) : null}
          <form onSubmit={handleLogin} className="editor-login-form">
            <Field
              label="Admin password"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <button className="editor-button editor-button-primary" type="submit">
              Open editor
            </button>
          </form>
          {status ? (
            <p className={`editor-status editor-status-${statusTone}`} role="alert">
              {status}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  if (!content) {
    return (
      <main className="editor-shell editor-login">
        <p className="editor-status editor-status-error" role="alert">
          {status || "The editor could not load the portfolio."}
        </p>
      </main>
    );
  }

  const { about, interests, profile, projects, sections, seo, timeline } = content;

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p className="editor-eyebrow">Private editor</p>
          <h1>Edit the portfolio.</h1>
          <p className="editor-header-copy">Change the content here, then save once.</p>
        </div>
        <div className="editor-actions">
          <Link className="editor-button" href="/" target="_blank" rel="noreferrer">
            View site ↗
          </Link>
          <button className="editor-button" type="button" onClick={() => void logout()}>
            Log out
          </button>
          <button
            className="editor-button editor-button-primary"
            type="button"
            onClick={() => void saveContent()}
            disabled={saving || !configured}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {!configured ? (
        <p className="editor-notice editor-notice-error">
          Saving is disabled until a Vercel Blob store is connected.
        </p>
      ) : null}

      {status ? (
        <p className={`editor-status editor-status-${statusTone}`} aria-live="polite">
          {status}
        </p>
      ) : null}

      <div className="editor-layout">
        <nav className="editor-tabs" aria-label="Editor sections">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "is-active" : ""}
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="editor-content">
          {activeTab === "profile" ? (
            <>
              <EditorSection eyebrow="01 / Identity" title="How you introduce yourself.">
                <div className="editor-grid editor-grid-two">
                  <Field label="Name" value={profile.name} onChange={(value) => updateProfile("name", value)} />
                  <Field label="Mark" value={profile.mark} onChange={(value) => updateProfile("mark", value)} />
                  <Field
                    label="Descriptor"
                    value={profile.descriptor}
                    onChange={(value) => updateProfile("descriptor", value)}
                  />
                  <Field
                    label="Location label"
                    value={profile.locationLabel}
                    onChange={(value) => updateProfile("locationLabel", value)}
                  />
                  <Field
                    label="Introduction"
                    value={profile.introduction}
                    onChange={(value) => updateProfile("introduction", value)}
                    multiline
                    rows={3}
                  />
                  <Field
                    label="Full location"
                    value={profile.location}
                    onChange={(value) => updateProfile("location", value)}
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={profile.email}
                    onChange={(value) => updateProfile("email", value)}
                  />
                </div>
              </EditorSection>

              <EditorSection eyebrow="02 / Contact" title="Where people can find you.">
                <div className="editor-repeater">
                  {profile.links.map((link, index) => (
                    <div className="editor-repeater-row" key={`${link.label}-${index}`}>
                      <Field
                        label="Label"
                        value={link.label}
                        onChange={(value) => updateProfileLink(index, { label: value })}
                      />
                      <Field
                        label="Link"
                        type="url"
                        value={link.href}
                        onChange={(value) => updateProfileLink(index, { href: value })}
                      />
                      <button
                        className="editor-icon-button"
                        type="button"
                        aria-label={`Remove ${link.label}`}
                        onClick={() =>
                          setContent((current) =>
                            current
                              ? {
                                  ...current,
                                  profile: {
                                    ...current.profile,
                                    links: current.profile.links.filter(
                                      (_, linkIndex) => linkIndex !== index,
                                    ),
                                  },
                                }
                              : current,
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="editor-button"
                  type="button"
                  onClick={() =>
                    setContent((current) =>
                      current
                        ? {
                            ...current,
                            profile: {
                              ...current.profile,
                              links: [
                                ...current.profile.links,
                                { label: "New link", href: "https://" },
                              ],
                            },
                          }
                        : current,
                    )
                  }
                >
                  + Add link
                </button>
              </EditorSection>
            </>
          ) : null}

          {activeTab === "projects" ? (
            <EditorSection eyebrow="01 / Work" title="Projects in display order.">
              <div className="editor-card-list">
                {projects.map((project, index) => (
                  <SortableDropTarget
                    key={`project-${index}`}
                    listId="projects"
                    index={index}
                    className="editor-card"
                    onReorder={reorderProjects}
                  >
                    <div className="editor-card-heading">
                      <p className="editor-eyebrow">{String(index + 1).padStart(2, "0")}</p>
                      <div className="editor-card-actions">
                        <OrderControls
                          listId="projects"
                          index={index}
                          itemCount={projects.length}
                          label={project.name}
                          onReorder={reorderProjects}
                        />
                        <button
                          className="editor-remove-button"
                          type="button"
                          onClick={() =>
                            setContent((current) =>
                              current
                                ? {
                                    ...current,
                                    projects: current.projects.filter(
                                      (_, projectIndex) => projectIndex !== index,
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          Remove project
                        </button>
                      </div>
                    </div>
                    <div className="editor-grid editor-grid-two">
                      <Field label="Name" value={project.name} onChange={(value) => updateProject(index, { name: value })} />
                      <Field label="Status" value={project.status} onChange={(value) => updateProject(index, { status: value })} />
                      <Field
                        label="Summary"
                        value={project.summary}
                        onChange={(value) => updateProject(index, { summary: value })}
                      />
                      <StackEditor
                        listId={`stack-${index}`}
                        stack={project.stack}
                        onChange={(stack) => updateProject(index, { stack })}
                      />
                      <Field
                        label="Detail"
                        value={project.detail}
                        onChange={(value) => updateProject(index, { detail: value })}
                        multiline
                        rows={4}
                      />
                    </div>
                    <div className="editor-subsection">
                      <div className="editor-subsection-heading">
                        <h3>Links</h3>
                        <button
                          className="editor-button editor-button-small"
                          type="button"
                          onClick={() =>
                            updateProject(index, {
                              links: [...project.links, { label: "live", href: "https://" }],
                            })
                          }
                        >
                          + Add link
                        </button>
                      </div>
                      <div className="editor-repeater">
                        {project.links.map((link, linkIndex) => (
                          <div className="editor-repeater-row" key={`${link.label}-${linkIndex}`}>
                            <label className="editor-field">
                              <span className="editor-label">Type</span>
                              <select
                                value={link.label}
                                onChange={(event) =>
                                  updateProjectLink(index, linkIndex, {
                                    label: event.target.value as "live" | "source",
                                  })
                                }
                              >
                                <option value="live">live</option>
                                <option value="source">source</option>
                              </select>
                            </label>
                            <Field
                              label="URL"
                              type="url"
                              value={link.href}
                              onChange={(value) => updateProjectLink(index, linkIndex, { href: value })}
                            />
                            <button
                              className="editor-icon-button"
                              type="button"
                              aria-label={`Remove ${link.label} link`}
                              onClick={() =>
                                updateProject(index, {
                                  links: project.links.filter(
                                    (_, currentLinkIndex) => currentLinkIndex !== linkIndex,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <AdminImageEditor
                      images={project.images}
                      nameForAlt={project.name}
                      onChange={(images) => updateProject(index, { images })}
                    />
                  </SortableDropTarget>
                ))}
              </div>
              <button
                className="editor-button"
                type="button"
                onClick={() =>
                  setContent((current) =>
                    current ? { ...current, projects: [...current.projects, emptyProject()] } : current,
                  )
                }
              >
                + Add project
              </button>
            </EditorSection>
          ) : null}

          {activeTab === "experience" ? (
            <EditorSection eyebrow="01 / Experience" title="Work and study in display order.">
              <div className="editor-card-list">
                {timeline.map((entry, index) => (
                  <SortableDropTarget
                    key={`timeline-${index}`}
                    listId="timeline"
                    index={index}
                    className="editor-card"
                    onReorder={reorderTimeline}
                  >
                    <div className="editor-card-heading">
                      <p className="editor-eyebrow">{String(index + 1).padStart(2, "0")}</p>
                      <div className="editor-card-actions">
                        <OrderControls
                          listId="timeline"
                          index={index}
                          itemCount={timeline.length}
                          label={entry.organization}
                          onReorder={reorderTimeline}
                        />
                        <button
                          className="editor-remove-button"
                          type="button"
                          onClick={() =>
                            setContent((current) =>
                              current
                                ? {
                                    ...current,
                                    timeline: current.timeline.filter(
                                      (_, entryIndex) => entryIndex !== index,
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          Remove entry
                        </button>
                      </div>
                    </div>
                    <div className="editor-grid editor-grid-two">
                      <Field
                        label="Organization"
                        value={entry.organization}
                        onChange={(value) => updateTimeline(index, { organization: value })}
                      />
                      <Field
                        label="Role"
                        value={entry.role}
                        onChange={(value) => updateTimeline(index, { role: value })}
                      />
                      <Field
                        label="Period"
                        value={entry.period}
                        onChange={(value) => updateTimeline(index, { period: value })}
                      />
                      <Field
                        label="Summary"
                        value={entry.summary}
                        onChange={(value) => updateTimeline(index, { summary: value })}
                        multiline
                        rows={3}
                      />
                    </div>
                    <AdminImageEditor
                      images={entry.images}
                      nameForAlt={entry.organization}
                      onChange={(images) => updateTimeline(index, { images })}
                    />
                  </SortableDropTarget>
                ))}
              </div>
              <button
                className="editor-button"
                type="button"
                onClick={() =>
                  setContent((current) =>
                    current ? { ...current, timeline: [...current.timeline, emptyTimelineEntry()] } : current,
                  )
                }
              >
                + Add entry
              </button>
            </EditorSection>
          ) : null}

          {activeTab === "about" ? (
            <EditorSection eyebrow="01 / About" title="The short version.">
              <div className="editor-subsection">
                <div className="editor-subsection-heading">
                  <h3>Paragraphs</h3>
                  <button
                    className="editor-button editor-button-small"
                    type="button"
                    onClick={() =>
                      setContent((current) =>
                        current
                          ? {
                              ...current,
                              about: {
                                paragraphs: [...current.about.paragraphs, "New paragraph."],
                              },
                            }
                          : current,
                      )
                    }
                  >
                    + Add paragraph
                  </button>
                </div>
                <div className="editor-card-list">
                  {about.paragraphs.map((paragraph, index) => (
                    <div className="editor-repeater-row editor-repeater-row-wide" key={`paragraph-${index}`}>
                      <Field
                        label={`Paragraph ${index + 1}`}
                        value={paragraph}
                        onChange={(value) =>
                          setContent((current) =>
                            current
                              ? {
                                  ...current,
                                  about: {
                                    paragraphs: current.about.paragraphs.map(
                                      (item, paragraphIndex) =>
                                        paragraphIndex === index ? value : item,
                                    ),
                                  },
                                }
                              : current,
                          )
                        }
                        multiline
                        rows={4}
                      />
                      <div className="editor-reorder-actions">
                        <OrderControls
                          listId="paragraphs"
                          index={index}
                          itemCount={about.paragraphs.length}
                          label={`Paragraph ${index + 1}`}
                          onReorder={reorderParagraphs}
                          showDragHandle={false}
                        />
                        <button
                          className="editor-icon-button"
                          type="button"
                          aria-label={`Remove paragraph ${index + 1}`}
                          onClick={() =>
                            setContent((current) =>
                              current
                                ? {
                                    ...current,
                                    about: {
                                      paragraphs: current.about.paragraphs.filter(
                                        (_, paragraphIndex) => paragraphIndex !== index,
                                      ),
                                    },
                                  }
                                : current,
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="editor-subsection">
                <div className="editor-subsection-heading">
                  <h3>Interests</h3>
                  <button
                    className="editor-button editor-button-small"
                    type="button"
                    onClick={() =>
                      setContent((current) =>
                        current
                          ? { ...current, interests: [...current.interests, "New interest"] }
                          : current,
                      )
                    }
                  >
                    + Add interest
                  </button>
                </div>
                <div className="editor-list-fields">
                  {interests.map((interest, index) => (
                    <div className="editor-list-row" key={`interest-${index}`}>
                      <span className="editor-list-index">{String(index + 1).padStart(2, "0")}</span>
                      <Field
                        label={`Interest ${index + 1}`}
                        value={interest}
                        onChange={(value) =>
                          setContent((current) =>
                            current
                              ? {
                                  ...current,
                                  interests: current.interests.map((item, interestIndex) =>
                                    interestIndex === index ? value : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <div className="editor-reorder-actions">
                        <OrderControls
                          listId="interests"
                          index={index}
                          itemCount={interests.length}
                          label={`Interest ${index + 1}`}
                          onReorder={reorderInterests}
                          showDragHandle={false}
                        />
                        <button
                          className="editor-icon-button"
                          type="button"
                          aria-label={`Remove interest ${index + 1}`}
                          onClick={() =>
                            setContent((current) =>
                              current
                                ? {
                                    ...current,
                                    interests: current.interests.filter(
                                      (_, interestIndex) => interestIndex !== index,
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </EditorSection>
          ) : null}

          {activeTab === "settings" ? (
            <>
              <EditorSection eyebrow="01 / Sections" title="Labels and headlines.">
                <div className="editor-grid editor-grid-two">
                  {(Object.keys(sections) as Array<keyof typeof sections>).map((sectionId) => (
                    <div className="editor-card editor-card-compact" key={sectionId}>
                      <p className="editor-eyebrow">{sectionId}</p>
                      <Field
                        label="Label"
                        value={sections[sectionId].label}
                        onChange={(value) =>
                          setContent((current) =>
                            current
                              ? {
                                  ...current,
                                  sections: {
                                    ...current.sections,
                                    [sectionId]: {
                                      ...current.sections[sectionId],
                                      label: value,
                                    },
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <Field
                        label="Headline"
                        value={sections[sectionId].title}
                        onChange={(value) =>
                          setContent((current) =>
                            current
                              ? {
                                  ...current,
                                  sections: {
                                    ...current.sections,
                                    [sectionId]: {
                                      ...current.sections[sectionId],
                                      title: value,
                                    },
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </EditorSection>

              <EditorSection eyebrow="02 / Search" title="How the site appears when shared.">
                <div className="editor-grid editor-grid-two">
                  <Field label="Page title" value={seo.title} onChange={(value) => setContent((current) => current ? { ...current, seo: { ...current.seo, title: value } } : current)} />
                  <Field label="Description" value={seo.description} onChange={(value) => setContent((current) => current ? { ...current, seo: { ...current.seo, description: value } } : current)} multiline rows={3} />
                  <Field label="Social description" value={seo.socialDescription} onChange={(value) => setContent((current) => current ? { ...current, seo: { ...current.seo, socialDescription: value } } : current)} multiline rows={3} />
                </div>
              </EditorSection>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
