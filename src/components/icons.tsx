import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </Base>
);

export const IconEditBig = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z" />
  </Base>
);

export const IconUserAdd = (p: P) => (
  <Base {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20a6.5 6.5 0 0 1 11 -4.7" />
    <path d="M18 14v6M15 17h6" />
  </Base>
);

export const IconMagnifyingGlass = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Base>
);

export const IconCrossSmall = (p: P) => (
  <Base {...p}>
    <path d="m7 7 10 10M17 7 7 17" />
  </Base>
);

export const IconChevronDownSmall = (p: P) => (
  <Base {...p}>
    <path d="m7 10 5 5 5-5" />
  </Base>
);

export const IconCheckmark1Small = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
);

export const IconSidebarLeftArrow = (p: P) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9.5 4v16" />
    <path d="m16 9.5-2.5 2.5 2.5 2.5" />
  </Base>
);

export const IconPlugConnector = (p: P) => (
  <Base {...p}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
    <path d="M12 17v4" />
  </Base>
);

export const IconSparkle = (p: P) => (
  <Base {...p}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
  </Base>
);

export const IconArrowBoxLeft = (p: P) => (
  <Base {...p}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M10 8 6 12l4 4M6 12h8" />
  </Base>
);

export const IconPin = (p: P) => (
  <Base {...p}>
    <path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9 9 3Z" />
    <path d="M12 12.5V21" />
  </Base>
);

export const IconRotate = (p: P) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Base>
);

export const IconLayers = (p: P) => (
  <Base {...p}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
    <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
  </Base>
);

export const IconArrowUp = (p: P) => (
  <Base {...p}>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </Base>
);

/* Source marks. Filled brand-ish glyphs at 14-16px, drawn rather than imported
   so the rail has no icon-pack dependency. */
export const IconGithub = ({ size = 16, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
  </svg>
);

export const IconLinear = ({ size = 16, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
    <path d="M2.2 14.1 9.9 21.8a10 10 0 0 1-7.7-7.7ZM2 11.1 12.9 22a10 10 0 0 0 2.5-.6L2.6 8.6a10 10 0 0 0-.6 2.5ZM3.7 6.6l13.7 13.7a10 10 0 0 0 1.8-1.4L5.1 4.8a10 10 0 0 0-1.4 1.8ZM6.6 3.4 20.6 17.4a10 10 0 1 0-14-14Z" />
  </svg>
);

export const IconNotion = ({ size = 16, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" {...rest}>
    <path d="M4 5.2 14.3 4a2 2 0 0 1 1.5.4l3.5 2.4a1 1 0 0 1 .4.9v10.6a1.5 1.5 0 0 1-1.3 1.5l-11.5 1.1a1.5 1.5 0 0 1-1.7-1.5V6.2a1 1 0 0 1 .8-1Z" />
    <path d="M9 8.5v7l6-.5v-6" />
  </svg>
);

export const IconMail = (p: P) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7.5 8.5 5.5 8.5-5.5" />
  </Base>
);

export const IconCalendar = (p: P) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </Base>
);
