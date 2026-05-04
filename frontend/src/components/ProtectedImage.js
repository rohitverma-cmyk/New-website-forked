/**
 * Wrapper around <img> that disables the easy "save the image" paths most
 * users know about:
 *
 *   • draggable=false + onDragStart preventDefault → blocks drag-to-desktop
 *   • onContextMenu preventDefault → blocks right-click "Save image as…"
 *     (also kills macOS force-click which uses the same context menu)
 *   • CSS user-drag/user-select: none → reinforces both above
 *   • onDoubleClick preventDefault → blocks the macOS Look-Up / preview gesture
 *     that some users describe as "double-click downloads"
 *
 * IMPORTANT: nothing on the open web makes an image truly un-saveable.
 * Anyone with DevTools or a screen-grab tool can still get the bytes. This
 * blocks the casual cases (90% of buyers) and is paired with our CSS
 * watermark overlay so anything that does leak still carries the brand.
 *
 * Drop-in replacement for the standard <img> tag — pass any prop you'd
 * normally pass to <img> (src, alt, className, onError, loading, etc.).
 */
import React from "react";

const noSaveStyle = {
  WebkitUserDrag: "none",
  userDrag: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
};

const block = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

const ProtectedImage = React.forwardRef(({ style, onContextMenu, onDragStart, onDoubleClick, ...rest }, ref) => (
  <img
    ref={ref}
    draggable={false}
    onContextMenu={(e) => {
      block(e);
      onContextMenu?.(e);
    }}
    onDragStart={(e) => {
      block(e);
      onDragStart?.(e);
    }}
    onDoubleClick={(e) => {
      // We don't kill bubbling here — the parent <Link> still gets the click
      // so the navigation to PDP works. We only stop the BROWSER default
      // (force-click preview / save-image menu).
      e.preventDefault();
      onDoubleClick?.(e);
    }}
    style={{ ...noSaveStyle, ...(style || {}) }}
    {...rest}
  />
));

ProtectedImage.displayName = "ProtectedImage";

export default ProtectedImage;
