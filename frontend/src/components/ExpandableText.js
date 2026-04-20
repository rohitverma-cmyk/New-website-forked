import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * ExpandableText Component
 * - Shows truncated text initially for better UX
 * - Full text remains in DOM for SEO (search engines can crawl it)
 * - Smooth expand/collapse animation
 */
const ExpandableText = ({ 
  text, 
  maxLength = 200, 
  maxLines = 2,
  className = "",
  showToggle = true 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!text) return null;
  
  const shouldTruncate = text.length > maxLength;
  
  // For SEO: Full text is always in the DOM, just visually hidden when collapsed
  return (
    <div className={`relative ${className}`} data-testid="expandable-text">
      {/* SEO-friendly: Full text is always present in DOM */}
      <div 
        className="text-gray-600 leading-relaxed transition-all duration-300"
        style={{
          // Use CSS to visually truncate while keeping full text for SEO
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          overflow: isExpanded ? 'visible' : 'hidden',
          WebkitLineClamp: isExpanded ? 'unset' : maxLines,
        }}
      >
        {text}
      </div>
      
      {/* Hidden full text for SEO crawlers (sr-only = screen reader only) */}
      <span className="sr-only">{text}</span>
      
      {/* Toggle Button */}
      {shouldTruncate && showToggle && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:text-blue-700 transition-colors"
          data-testid="expand-toggle"
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              Show Less
              <ChevronUp size={16} />
            </>
          ) : (
            <>
              Read More
              <ChevronDown size={16} />
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ExpandableText;
