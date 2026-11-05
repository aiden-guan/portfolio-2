"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import type { Post } from "@/content/founder";
import { Carousel } from "./carousel";
import {
  ArrowRightIcon,
  ChevronIcon,
  CommentIcon,
  GlobeIcon,
  ReactionIcon,
  RepostIcon,
  SendIcon,
  ThumbIcon,
  type ReactionKind,
} from "./icons";
import { scrollToId, useFounder } from "./provider";
import { SeeMore } from "./see-more";
import styles from "./founder.module.css";

type Tab = "posts" | "comments" | "images";

const TABS: { key: Tab; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "images", label: "Images" },
];

/** LinkedIn's six reactions, in its order. */
const REACTIONS: ReactionKind[] = ["like", "celebrate", "support", "love", "insightful", "funny"];

const REACTION_LABEL: Record<ReactionKind, string> = {
  like: "Like",
  celebrate: "Celebrate",
  support: "Support",
  love: "Love",
  insightful: "Insightful",
  funny: "Funny",
};

type Author = { name: string; first: string; headline: string; photo: string };

/** A count the content may give a post, like comments, or nothing. */
function countOf(post: Post, key: "comments" | "reposts") {
  const fields: Record<string, unknown> = post;
  const value = fields[key];
  return typeof value === "number" && value > 0 ? value : 0;
}

export function Activity({
  posts,
  images,
  author,
}: {
  posts: Post[];
  images: { src: string; alt: string; caption: string }[];
  author: Author;
}) {
  const [tab, setTab] = useState<Tab>("posts");
  const [all, setAll] = useState(false);
  // Kept here rather than in each card, so a reaction survives the switch between carousel and feed.
  const [mine, setMine] = useState<Record<string, ReactionKind | undefined>>({});
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const react = useCallback((postId: string, kind: ReactionKind | null) => {
    setMine((current) => ({ ...current, [postId]: kind ?? undefined }));
  }, []);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let next = index;
    if (event.key in moves) next = (index + moves[event.key] + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].key);
    tabButtons.current[next]?.focus();
  };

  const cards = posts.map((post) => (
    <PostCard key={post.id} post={post} author={author} wide={all} reaction={mine[post.id]} onReact={react} />
  ));

  return (
    <>
      <div className={styles.sectionBody}>
        <div className={styles.pills} role="tablist" aria-label="Activity">
          {TABS.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => {
                tabButtons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-${item.key}-tab`}
              aria-selected={tab === item.key}
              aria-controls={`${id}-${item.key}`}
              tabIndex={tab === item.key ? 0 : -1}
              className={styles.pill}
              onClick={() => setTab(item.key)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${id}-posts`} aria-labelledby={`${id}-posts-tab`} hidden={tab !== "posts"}>
          {all ? (
            <ul className={styles.feed} aria-label="Posts">
              {cards.map((card) => (
                <li key={card.key} className={styles.feedItem}>
                  {card}
                </li>
              ))}
            </ul>
          ) : (
            <Carousel label="Posts">
              {cards.map((card) => (
                <li key={card.key} className={styles.postItem}>
                  {card}
                </li>
              ))}
            </Carousel>
          )}
        </div>

        <div role="tabpanel" id={`${id}-comments`} aria-labelledby={`${id}-comments-tab`} hidden={tab !== "comments"}>
          <p className={styles.empty}>{author.first} hasn’t commented on anything yet.</p>
        </div>

        <div role="tabpanel" id={`${id}-images`} aria-labelledby={`${id}-images-tab`} hidden={tab !== "images"}>
          <ul className={styles.imageGrid}>
            {images.map((image) => (
              <li key={image.src}>
                <figure>
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={400}
                    height={400}
                    sizes="(max-width: 767px) 50vw, 374px"
                    className={styles.imageTileImg}
                  />
                  <figcaption className={styles.imageCaption}>{image.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.footerButton}
          aria-expanded={tab === "posts" && all}
          onClick={() => {
            if (tab === "posts" && all) {
              flushSync(() => setAll(false));
              scrollToId("activity");
              return;
            }
            setTab("posts");
            setAll(true);
          }}
        >
          {tab === "posts" && all ? (
            <>
              Show fewer posts <ChevronIcon direction="up" />
            </>
          ) : (
            <>
              Show all posts <ArrowRightIcon />
            </>
          )}
        </button>
      </div>
    </>
  );
}

function PostCard({
  post,
  author,
  wide,
  reaction,
  onReact,
}: {
  post: Post;
  author: Author;
  /** Shown full width, in the feed, rather than in the carousel. */
  wide: boolean;
  reaction?: ReactionKind;
  onReact: (postId: string, kind: ReactionKind | null) => void;
}) {
  const { openMessaging, copyLink } = useFounder();
  const titleId = useId();
  const top: readonly ReactionKind[] = post.top;
  const shown = reaction && !top.includes(reaction) ? [reaction, ...top].slice(0, 3) : top;
  const comments = countOf(post, "comments");
  const reposts = countOf(post, "reposts");
  const path = `/founder#post-${post.id}`;

  const send = async () => {
    // A phone's share sheet is the nearest thing to LinkedIn's Send; elsewhere the link is copied.
    if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: `${author.name} on LockedIn`, url: `${window.location.origin}${path}` });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    copyLink(path, "link to post");
  };

  return (
    <article id={`post-${post.id}`} className={styles.post} aria-labelledby={titleId}>
      <header className={styles.postHead}>
        <Image className={styles.postAvatar} src={author.photo} alt="" width={48} height={48} />
        <div className={styles.postWho}>
          <p className={styles.postActor}>
            <span id={titleId} className={styles.postName}>
              {author.name}
            </span>
            <span className={styles.postYou}> • You</span>
          </p>
          <p className={styles.postHeadline}>{author.headline}</p>
          <p className={styles.postTime}>
            {post.when} •{" "}
            <GlobeIcon size={14} className={styles.postGlobe} aria-label="Visible to anyone on or off LockedIn" aria-hidden={false} role="img" />
          </p>
        </div>
      </header>

      <SeeMore className={styles.postText} text={post.text} lines={3} label="more" />

      {post.image ? (
        <div className={styles.postMedia}>
          <Image
            src={post.image.src}
            alt={post.image.alt}
            width={748}
            height={499}
            sizes={wide ? "(max-width: 767px) 100vw, 756px" : "(max-width: 767px) 85vw, 374px"}
            className={styles.postImage}
            style={post.image.position ? { objectPosition: post.image.position } : undefined}
          />
        </div>
      ) : null}

      <div className={styles.postSocial}>
        <span className={styles.reactionStack} aria-hidden="true">
          {shown.map((kind) => (
            <span key={kind} className={styles.reactionDisc}>
              <ReactionIcon kind={kind} />
            </span>
          ))}
        </span>
        <span key={reaction ? "you" : "count"} className={styles.reactionCount} data-you={reaction ? "" : undefined}>
          {reaction ? `You and ${post.reactions} others` : post.reactions}
          <span className={styles.visuallyHidden}>{reaction ? " reacted" : " reactions"}</span>
        </span>
        {comments || reposts ? (
          <span className={styles.postCounts}>
            {[comments ? `${comments} comment${comments === 1 ? "" : "s"}` : "", reposts ? `${reposts} repost${reposts === 1 ? "" : "s"}` : ""]
              .filter(Boolean)
              .join(" • ")}
          </span>
        ) : null}
      </div>

      <div className={styles.postActions}>
        <ReactButton reaction={reaction} onReact={(kind) => onReact(post.id, kind)} />
        <button type="button" className={styles.postAction} onClick={openMessaging}>
          <CommentIcon />
          <span>Comment</span>
        </button>
        <button type="button" className={styles.postAction} onClick={() => copyLink(path, "link to post")}>
          <RepostIcon />
          <span>Repost</span>
        </button>
        <button type="button" className={styles.postAction} onClick={send}>
          <SendIcon />
          <span>Send</span>
        </button>
      </div>
    </article>
  );
}

/**
 * Like, and the row of reactions over it: it opens after a moment's hover, on
 * a long press, or from the "Open reactions menu" button that shows on focus,
 * the way LinkedIn does it. A click on Like itself likes, or takes a reaction
 * back.
 */
function ReactButton({ reaction, onReact }: { reaction?: ReactionKind; onReact: (kind: ReactionKind | null) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pops, setPops] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const likeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  // A long press opens the menu; the click the finger then makes must not also like the post.
  const pressed = useRef(false);
  const focusOnOpen = useRef(false);
  const menuId = useId();

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(pressTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) {
      focusOnOpen.current = false;
      items.current[active]?.focus();
    }
    const onPointer = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const inside = host.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, active]);

  const pick = (kind: ReactionKind | null) => {
    window.clearTimeout(timer.current);
    // The row is about to hide; focus goes back to Like rather than to the page.
    const menu = host.current?.querySelector("[role=toolbar]");
    if (menu?.contains(document.activeElement)) likeButton.current?.focus();
    setOpen(false);
    onReact(kind);
    if (kind) setPops((count) => count + 1);
  };

  const openMenu = (withFocus: boolean) => {
    setActive(Math.max(0, reaction ? REACTIONS.indexOf(reaction) : 0));
    focusOnOpen.current = withFocus;
    setOpen(true);
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = REACTIONS.length - 1;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next = active;
    if (event.key in moves) next = (active + moves[event.key] + REACTIONS.length) % REACTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    setActive(next);
    items.current[next]?.focus();
  };

  return (
    <div
      ref={host}
      className={styles.reactHost}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        window.clearTimeout(timer.current);
        if (!open) timer.current = window.setTimeout(() => openMenu(false), 480);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        window.clearTimeout(timer.current);
        if (open) timer.current = window.setTimeout(() => setOpen(false), 320);
      }}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={likeButton}
        type="button"
        className={styles.postAction}
        aria-pressed={Boolean(reaction)}
        data-reaction={reaction}
        onClick={() => {
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          pick(reaction ? null : "like");
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          pressed.current = false;
          window.clearTimeout(pressTimer.current);
          pressTimer.current = window.setTimeout(() => {
            pressed.current = true;
            openMenu(false);
          }, 420);
        }}
        onPointerUp={() => window.clearTimeout(pressTimer.current)}
        onPointerCancel={() => window.clearTimeout(pressTimer.current)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span key={pops} className={reaction ? styles.pop : undefined}>
          {reaction && reaction !== "like" ? <ReactionIcon kind={reaction} size={20} /> : <ThumbIcon filled={reaction === "like"} />}
        </span>
        <span>{reaction ? REACTION_LABEL[reaction] : "Like"}</span>
      </button>
      <button
        ref={trigger}
        type="button"
        className={styles.reactTrigger}
        aria-label="Open reactions menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu(true))}
      >
        <ChevronIcon direction="up" size={12} />
      </button>
      <div id={menuId} className={styles.reactions} role="toolbar" aria-label="Reactions" hidden={!open} onKeyDown={onMenuKey}>
        {REACTIONS.map((kind, index) => (
          <button
            key={kind}
            ref={(element) => {
              items.current[index] = element;
            }}
            type="button"
            className={styles.reaction}
            aria-label={REACTION_LABEL[kind]}
            aria-pressed={reaction === kind}
            tabIndex={index === active ? 0 : -1}
            style={{ "--i": index } as CSSProperties}
            onClick={() => pick(kind)}
            onPointerEnter={() => setActive(index)}
          >
            <ReactionIcon kind={kind} size={36} />
            <span className={styles.reactionLabel} aria-hidden="true">
              {REACTION_LABEL[kind]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
