/**
 * Locofast brand identity — single source of truth.
 *
 * Three render modes:
 *   variant="mark"     → just the woven-X monogram
 *   variant="wordmark" → just the "Locofast" wordmark text
 *   variant="full"     → mark + wordmark side by side (default)
 *
 * Color scheme matches the brand SVG: blue mark (#2563EB) + dark
 * navy wordmark. Override with `markColor` / `wordColor` props.
 *
 * Sized via `size` (number, controls mark height in px). Wordmark
 * scales proportionally.
 */
import React from "react";

const Mark = ({ size = 28, color = "#2563EB", className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="100 0 200 200"
    aria-hidden="true"
    className={className}
    style={{ flexShrink: 0 }}
  >
    <g fill={color}>
      <path d="M113.47 40.0946C107.343 46.2214 107.343 56.155 113.47 62.2818L173.375 122.187L195.563 100L135.657 40.0946C129.53 33.9678 119.597 33.9678 113.47 40.0946Z" />
      <path d="M104.595 84.469C98.4683 90.5958 98.4683 100.529 104.595 106.656L146.751 148.812L168.938 126.625L126.782 84.469C120.655 78.3422 110.722 78.3422 104.595 84.469Z" />
      <path d="M259.905 13.47C253.779 7.34316 243.845 7.34317 237.718 13.47L177.813 73.3754L200 95.5626L259.905 35.6572C266.032 29.5303 266.032 19.5968 259.905 13.47Z" />
      <path d="M215.531 4.59511C209.404 -1.53172 199.471 -1.5317 193.344 4.59513L151.188 46.7508L173.375 68.9379L215.531 26.7823C221.658 20.6555 221.658 10.7219 215.531 4.59511Z" />
      <path d="M286.53 159.905C292.657 153.779 292.657 143.845 286.53 137.718L226.625 77.8128L204.437 100L264.343 159.905C270.47 166.032 280.403 166.032 286.53 159.905Z" />
      <path d="M295.405 115.531C301.532 109.404 301.532 99.4707 295.405 93.3438L253.249 51.1882L231.062 73.3754L273.218 115.531C279.345 121.658 289.278 121.658 295.405 115.531Z" />
      <path d="M140.095 186.53C146.221 192.657 156.155 192.657 162.282 186.53L222.187 126.625L200 104.437L140.095 164.343C133.968 170.47 133.968 180.403 140.095 186.53Z" />
      <path d="M184.469 195.405C190.596 201.532 200.529 201.532 206.656 195.405L248.812 153.249L226.625 131.062L184.469 173.218C178.342 179.345 178.342 189.278 184.469 195.405Z" />
    </g>
  </svg>
);

const LocofastLogo = ({
  variant = "full",
  size = 28,
  markColor = "#2563EB",
  wordColor = "#0B1F39",
  italicAccent = true,
  className = "",
}) => {
  if (variant === "mark") {
    return <Mark size={size} color={markColor} className={className} />;
  }
  // Wordmark style: low-cap "Locofast" with a slight italic finally-feel
  // to match the marketing collateral. We use Inter for the wordmark to
  // stay within the existing system font stack.
  const wordSize = Math.round(size * 1.05);
  const word = (
    <span
      style={{
        fontWeight: 700,
        fontSize: wordSize,
        color: wordColor,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        fontStyle: italicAccent ? "italic" : "normal",
      }}
    >
      Locofast
    </span>
  );
  if (variant === "wordmark") {
    return <span className={className}>{word}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={size} color={markColor} />
      {word}
    </span>
  );
};

export default LocofastLogo;
