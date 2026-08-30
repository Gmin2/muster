const PALETTE = ["#f09a2f", "#e08a3c", "#16a6c7", "#25a878", "#f68f3c", "#3d9aff"];

function pick(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function EntityChip({ name, color }: { name: string; color?: string }) {
  return (
    <span
      className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-field
        py-px pl-[3px] pr-1.5 align-middle shadow-hairline "
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full
        text-[9px] font-semibold leading-none text-white "
        style={{ background: color ?? pick(name) }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="text-[12px] font-medium text-ink">{name}</span>
    </span>
  );
}

export default EntityChip;
