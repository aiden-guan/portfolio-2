import type { AnchorHTMLAttributes, ReactNode } from "react";

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
};

export function ExternalLink({ children, className = "", ...props }: ExternalLinkProps) {
  return (
    <a
      {...props}
      className={`external-link ${className}`.trim()}
      target={props.href?.startsWith("mailto:") ? undefined : "_blank"}
      rel={props.href?.startsWith("mailto:") ? undefined : "noreferrer"}
    >
      <span>{children}</span>
      <span className="external-arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
