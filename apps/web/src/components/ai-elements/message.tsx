"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

// Adapted from Vercel AI Elements' message component.
export type MessageProps = HTMLAttributes<HTMLDivElement> & { from: UIMessage["role"] };
export const Message = ({ className, from, ...props }: MessageProps) => (
  <div className={cn("group flex w-full flex-col gap-2", from === "user" ? "ml-auto max-w-[85%] items-end" : "max-w-full items-start", className)} {...props} />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;
export const MessageContent = ({ className, ...props }: MessageContentProps) => (
  <div className={cn("min-w-0 max-w-full overflow-hidden text-[16px] leading-7", className)} {...props} />
);

export type MessageResponseProps = ComponentProps<typeof Streamdown>;
const plugins = { cjk, code, math, mermaid };
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => <Streamdown className={cn("prose-ai size-full", className)} plugins={plugins} {...props} />,
  (prev, next) => prev.children === next.children,
);
MessageResponse.displayName = "MessageResponse";
