// vibechess mark: a line-art knight head whose neck carries an opening-tree
// branch ending in the signal-orange node. The knight strokes use currentColor
// so the mark adapts to light/dark from the surrounding text color; the node
// stays brand orange in both themes.
const LogoMark = ({ className = "h-5 w-auto" }) => (
  <svg
    viewBox="0 0 120 150"
    fill="none"
    className={className}
    role="img"
    aria-label="vibechess"
  >
    <g
      stroke="currentColor"
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path
        d="M 52 135 C 47 112 45 96 45 82 C 45 74 45 70 47 66 L 24 61 L 36 55
           L 44 48 L 53 24 L 61 35 L 54 40 C 71 33 87 43 89 67
           C 91 99 83 123 74 135"
      />
      <line x1="59" y1="100" x2="59" y2="128" />
      <line x1="59" y1="111" x2="71" y2="106" />
    </g>
    <circle cx="59" cy="100" r="4.5" fill="currentColor" />
    <circle cx="59" cy="128" r="4.5" fill="currentColor" />
    <circle cx="71" cy="106" r="5" fill="#FF6600" />
  </svg>
);

export default LogoMark;
