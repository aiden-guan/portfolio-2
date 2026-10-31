"use client";

import Image from "next/image";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Post, Reaction } from "@/content/founder";
import { Carousel } from "./carousel";
import { ArrowRightIcon, CommentIcon, GlobeIcon, ReactionIcon, RepostIcon, SendIcon, ThumbIcon } from "./icons";
import { scrollToId, useFounder } from "./provider";
import { SeeMore } from "./see-more";
import styles from "./founder.module.css";

type Tab = "posts" | "comments" | "images";

const TABS: { key: Tab; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "images", label: "Images" },
];

type Author = { name: string; first: string; headline: string; photo: string };

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
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

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
          <Carousel label="Posts">
            {posts.map((post) => (
              <li key={post.id} className={styles.postItem}>
                <PostCard post={post} author={author} />
              </li>
            ))}
          </Carousel>
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
          onClick={() => {
            setTab("posts");
            scrollToId("activity");
          }}
        >
          Show all posts <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}

function PostCard({ post, author }: { post: Post; author: Author }) {
  const { openMessaging, copyProfileLink } = useFounder();
  const [liked, setLiked] = useState(false);
  const titleId = useId();
  const others = post.reactions;
  const shown: Reaction[] = liked && !post.top.includes("like") ? ["like", ...post.top] : post.top;

  return (
    <article className={styles.post} aria-labelledby={titleId}>
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
            <GlobeIcon size={14} className={styles.postGlobe} aria-label="Visible to anyone on or off ClockedIn" aria-hidden={false} role="img" />
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
            sizes="(max-width: 767px) 85vw, 374px"
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
        <span className={styles.reactionCount}>
          {liked ? `You and ${others} others` : others}
          <span className={styles.visuallyHidden}> reactions</span>
        </span>
      </div>

      <div className={styles.postActions}>
        <button
          type="button"
          className={styles.postAction}
          aria-pressed={liked}
          data-liked={liked || undefined}
          onClick={() => setLiked((value) => !value)}
        >
          <span key={liked ? "on" : "off"} className={liked ? styles.pop : undefined}>
            <ThumbIcon filled={liked} />
          </span>
          <span>Like</span>
        </button>
        <button type="button" className={styles.postAction} onClick={openMessaging}>
          <CommentIcon />
          <span>Comment</span>
        </button>
        <button type="button" className={styles.postAction} onClick={copyProfileLink}>
          <RepostIcon />
          <span>Repost</span>
        </button>
        <button type="button" className={styles.postAction} onClick={openMessaging}>
          <SendIcon />
          <span>Send</span>
        </button>
      </div>
    </article>
  );
}
