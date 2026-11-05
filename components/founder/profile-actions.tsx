"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ClockIcon,
  CloseIcon,
  CodeIcon,
  ConnectIcon,
  EllipsisIcon,
  ExternalIcon,
  LinkIcon,
  MailIcon,
  ProfileCardIcon,
  WebIcon,
} from "./icons";
import { useFounder } from "./provider";
import styles from "./founder.module.css";

/** Connect, Message and More, under the headline. */
export function ProfileActions({ name, linkedin, github }: { name: string; linkedin: string; github: string }) {
  const { openMessaging, copyProfileLink, toast } = useFounder();
  const [open, setOpen] = useState(false);
  // Connect sends an invitation that stays pending, as it would here; Undo or Pending takes it back.
  const [pending, setPending] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const connect = () => {
    if (pending) {
      setPending(false);
      toast("Invitation withdrawn.");
      return;
    }
    setPending(true);
    toast("Your invitation to connect was sent.", { label: "Undo", run: () => setPending(false) });
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={`${styles.btn} ${pending ? `${styles.muted} ${styles.pending}` : styles.primary} ${styles.connect}`}
        aria-label={pending ? "Pending, withdraw invitation" : `Invite ${name} to connect`}
        onClick={connect}
      >
        {pending ? <ClockIcon handClassName={styles.clockHand} /> : <ConnectIcon />}
        {pending ? "Pending" : "Connect"}
      </button>
      <button type="button" className={`${styles.btn} ${styles.secondary}`} onClick={openMessaging}>
        Message
      </button>
      <div ref={host} className={styles.moreHost}>
        <button
          ref={trigger}
          type="button"
          className={`${styles.btn} ${styles.muted} ${styles.more}`}
          aria-label="More actions"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.moreLabel}>More</span>
          <EllipsisIcon className={styles.moreIcon} />
        </button>
        <div id={menuId} className={styles.popover} hidden={!open}>
          <a className={styles.popoverItem} href={linkedin} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <ExternalIcon size={24} strokeWidth={1.1} />
            View on LinkedIn
          </a>
          <a className={styles.popoverItem} href={github} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <CodeIcon />
            Visit GitHub
          </a>
          <button
            type="button"
            className={styles.popoverItem}
            onClick={() => {
              setOpen(false);
              copyProfileLink();
            }}
          >
            <LinkIcon size={24} strokeWidth={1.1} />
            Copy profile link
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Contact info", and the modal it opens. */
export function ContactInfo({
  name,
  first,
  email,
  github,
  linkedin,
  site,
}: {
  name: string;
  first: string;
  email: string;
  github: string;
  linkedin: string;
  site: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  const rows = [
    { icon: <ProfileCardIcon />, label: `${first}’s Profile`, href: linkedin, text: bare(linkedin) },
    { icon: <WebIcon />, label: "Website", href: site, text: bare(site), note: "(Portfolio)" },
    { icon: <CodeIcon />, label: "GitHub", href: github, text: bare(github) },
    { icon: <MailIcon />, label: "Email", href: `mailto:${email}`, text: email },
  ];

  return (
    <>
      <button type="button" className={styles.inlineLink} onClick={() => dialog.current?.showModal()}>
        Contact info
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div>
          <header className={styles.dialogHead}>
            <h2 id={titleId} className={styles.dialogTitle}>
              {name}
            </h2>
            <button type="button" className={styles.iconButton} aria-label="Dismiss" onClick={() => dialog.current?.close()}>
              <CloseIcon />
            </button>
          </header>
          <div className={styles.dialogBody}>
            <h3 className={styles.dialogSubtitle}>Contact Info</h3>
            <ul className={styles.contactList}>
              {rows.map((row) => (
                <li key={row.label} className={styles.contactRow}>
                  <span className={styles.contactIcon}>{row.icon}</span>
                  <div>
                    <p className={styles.contactLabel}>{row.label}</p>
                    <a
                      className={styles.link}
                      href={row.href}
                      {...(row.href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                    >
                      {row.text}
                    </a>
                    {row.note ? <span className={styles.contactNote}> {row.note}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
