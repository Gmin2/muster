/* Icons for the sidebar-nav primitive.
 *
 * The upstream component imports @central-icons-react, which is a commercially
 * licensed set gated behind CENTRAL_LICENSE_KEY at install time. These are
 * drop-in replacements drawn from the local Nucleo library and matched to the
 * same { size, className } API. */

type Props = { size?: number; className?: string };

function Svg({
  size = 18,
  className,
  box,
  width = 1.5,
  children,
}: Props & { box: number; width?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconHome(p: Props) {
  return (
    <Svg {...p} box={12}>
      <line x1="6" y1="10.75" x2="6" y2="8" />
      <path d="m1.685,3.5L5.435.934c.34-.233.789-.233,1.129,0l3.75,2.566c.272.186.435.495.435.825v4.425c0,1.105-.895,2-2,2H3.25c-1.105,0-2-.895-2-2v-4.425c0-.33.163-.639.435-.825Z" />
    </Svg>
  );
}

export function IconMagnifyingGlass(p: Props) {
  return (
    <Svg {...p} box={12}>
      <line x1="7.652" y1="7.652" x2="10.75" y2="10.75" />
      <circle cx="5" cy="5" r="3.75" />
    </Svg>
  );
}

export function IconPlusMedium(p: Props) {
  return (
    <Svg {...p} box={12}>
      <line x1="10.75" y1="6" x2="1.25" y2="6" />
      <line x1="6" y1="10.75" x2="6" y2="1.25" />
    </Svg>
  );
}

export function IconCrossSmall(p: Props) {
  return (
    <Svg {...p} box={12}>
      <line x1="2.25" y1="9.75" x2="9.75" y2="2.25" />
      <line x1="9.75" y1="9.75" x2="2.25" y2="2.25" />
    </Svg>
  );
}

export function IconCheckmark1Small(p: Props) {
  return (
    <Svg {...p} box={12}>
      <path d="m1.76,7.004l2.25,3L10.24,1.746" />
    </Svg>
  );
}

export function IconChevronDownSmall(p: Props) {
  return (
    <Svg {...p} box={12}>
      <polyline points="1.75 4.25 6 8.5 10.25 4.25" />
    </Svg>
  );
}

export function IconSettingsGear1(p: Props) {
  return (
    <Svg {...p} box={12} width={1.2}>
      <circle cx="6" cy="6" r="4" />
      <line x1="6" y1=".75" x2="6" y2="2" />
      <line x1="3.375" y1="1.453" x2="4" y2="2.536" />
      <line x1="1.453" y1="3.375" x2="2.536" y2="4" />
      <line x1=".75" y1="6" x2="2" y2="6" />
      <line x1="1.453" y1="8.625" x2="2.536" y2="8" />
      <line x1="3.375" y1="10.547" x2="4" y2="9.464" />
      <line x1="6" y1="11.25" x2="6" y2="10" />
      <line x1="8.625" y1="10.547" x2="8" y2="9.464" />
      <line x1="10.547" y1="8.625" x2="9.464" y2="8" />
      <line x1="11.25" y1="6" x2="10" y2="6" />
      <line x1="10.547" y1="3.375" x2="9.464" y2="4" />
      <line x1="8.625" y1="1.453" x2="8" y2="2.536" />
    </Svg>
  );
}

export function IconEditBig(p: Props) {
  return (
    <Svg {...p} box={18}>
      <path d="M3.83549 10.25H3.25C2.422 10.25 1.75 10.922 1.75 11.75C1.75 12.578 2.422 13.25 3.25 13.25H14.75C15.578 13.25 16.25 13.922 16.25 14.75C16.25 15.578 15.578 16.25 14.75 16.25H12.75" />
      <path d="M6.75 10.25C6.75 10.25 9.0838 10.1662 9.909 9.34101L14.784 4.46601C15.4053 3.84471 15.4053 2.83731 14.784 2.21601C14.1627 1.59471 13.1553 1.59471 12.534 2.21601L7.659 7.09101C6.8809 7.86911 6.75 10.25 6.75 10.25Z" />
    </Svg>
  );
}

export function IconArrowBoxLeft(p: Props) {
  return (
    <Svg {...p} box={18}>
      <path d="M11.75,5.75V3.25c0-.552-.448-1-1-1H4.25c-.552,0-1,.448-1,1V14.75c0,.552,.448,1,1,1h6.5c.552,0,1-.448,1-1v-2.5" />
      <polyline points="14.5 6.25 17.25 9 14.5 11.75" />
      <line x1="17.25" y1="9" x2="11.25" y2="9" />
    </Svg>
  );
}

/* Nucleo ships sidebar-right; the left variant is the same glyph mirrored. */
export function IconSidebarLeftArrow({ size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(24 0) scale(-1 1)">
        <line x1="15" y1="4" x2="15" y2="20" strokeMiterlimit="10" />
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" strokeMiterlimit="10" />
      </g>
    </svg>
  );
}

/* No user-add glyph in the local set — user-3 with a plus composed alongside. */
export function IconUserAdd({ size = 18, className }: Props) {
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
      className={className}
      aria-hidden="true"
    >
      <path d="m10,2h0c2.124,0,3.767,1.862,3.504,3.969l-.132,1.054c-.213,1.701-1.658,2.977-3.372,2.977h0c-1.714,0-3.16-1.276-3.372-2.977l-.132-1.054c-.263-2.108,1.38-3.969,3.504-3.969Z" />
      <path d="m4.103,13.71c3.1-.746,6.2-.9,9.3-.46" />
      <path d="M3.5,15.1l-1,3.5c-.328,1.148.417,2.331,1.594,2.529,2.6.437,5.2.62,7.8.548" />
      <line x1="18.5" y1="14" x2="18.5" y2="21" />
      <line x1="15" y1="17.5" x2="22" y2="17.5" />
    </svg>
  );
}

/* Stands in for the upstream popsicle brand mark. */
export function IconPopsicle2(p: Props) {
  return (
    <Svg {...p} box={18}>
      <path d="M14.75,8c-1.91,0-3.469-1.433-3.703-3.28-.099,.01-.195,.03-.297,.03-1.618,0-2.928-1.283-2.989-2.887-3.413,.589-6.011,3.556-6.011,7.137,0,4.004,3.246,7.25,7.25,7.25s7.25-3.246,7.25-7.25c0-.434-.045-.857-.118-1.271-.428,.17-.893,.271-1.382,.271Z" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.25" cy="11.25" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="11.25" cy="11.75" r=".75" fill="currentColor" stroke="none" />
    </Svg>
  );
}
