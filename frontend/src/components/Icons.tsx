/**
 * Icons — small inline SVGs, 1.5 stroke, monochrome, sized via wrapper.
 *
 * Pure presentation. No React import needed — the JSX type covers it.
 * Each icon paints with `currentColor` so a parent's text color decides the tint,
 * keeping the brand voice consistent (ink / body / mute) without per-icon props.
 */

type IconProps = {
  size?: number
  className?: string
  strokeWidth?: number
}

function svgProps({ size = 16, className, strokeWidth = 1.5 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  }
}

export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const ChatIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

export const LayersIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
)

export const ZoomFitIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M3 9V5a2 2 0 0 1 2-2h4" />
    <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
    <path d="M3 15v4a2 2 0 0 0 2 2h4" />
    <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
  </svg>
)

// Six-dot drag handle for reordering rows.
export const GripIcon = (p: IconProps) => (
  <svg {...svgProps(p)} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.4" />
    <circle cx="15" cy="6" r="1.4" />
    <circle cx="9" cy="12" r="1.4" />
    <circle cx="15" cy="12" r="1.4" />
    <circle cx="9" cy="18" r="1.4" />
    <circle cx="15" cy="18" r="1.4" />
  </svg>
)

export const EyeIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const EyeOffIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
)

export const KebabIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="5"  r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const SlidersIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <line x1="4"  y1="21" x2="4"  y2="14" />
    <line x1="4"  y1="10" x2="4"  y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8"  x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1"  y1="14" x2="7"  y2="14" />
    <line x1="9"  y1="8"  x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
)

export const DownloadIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

export const LockIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export const TableIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3"  y1="9"  x2="21" y2="9" />
    <line x1="3"  y1="15" x2="21" y2="15" />
    <line x1="9"  y1="3"  x2="9"  y2="21" />
    <line x1="15" y1="3"  x2="15" y2="21" />
  </svg>
)

export const PencilIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

export const TrashIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

export const BoltIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

export const PlusIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <line x1="12" y1="5"  x2="12" y2="19" />
    <line x1="5"  y1="12" x2="19" y2="12" />
  </svg>
)

export const XIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <line x1="18" y1="6"  x2="6"  y2="18" />
    <line x1="6"  y1="6"  x2="18" y2="18" />
  </svg>
)

export const SendIcon = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)
