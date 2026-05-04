/**
 * Row of small certification chips — used on the listing card, PDP strip,
 * and anywhere we need to surface a fabric's credentials at a glance.
 *
 *   <CertificationBadges certs={fabric.certifications} size="sm" />
 *
 * Unknown keys are silently dropped so legacy data never breaks render.
 */
import React from "react";
import { resolveCerts } from "../lib/certifications";

const sizes = {
  xs: { base: "text-[9px] px-1.5 py-[1px] gap-0.5", dot: "w-1 h-1" },
  sm: { base: "text-[10px] px-2 py-0.5 gap-1", dot: "w-1.5 h-1.5" },
  md: { base: "text-xs px-2.5 py-1 gap-1.5", dot: "w-2 h-2" },
};

const CertificationBadges = ({
  certs,
  size = "sm",
  max = null,
  className = "",
  testIdPrefix = "cert",
}) => {
  const resolved = resolveCerts(certs);
  if (!resolved.length) return null;
  const visible = max ? resolved.slice(0, max) : resolved;
  const remaining = max ? resolved.length - visible.length : 0;
  const s = sizes[size] || sizes.sm;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`} data-testid={`${testIdPrefix}-list`}>
      {visible.map((c) => (
        <span
          key={c.key}
          className={`inline-flex items-center font-semibold rounded-full border ${c.chipClass} ${s.base}`}
          title={`${c.fullName} — ${c.description}`}
          data-testid={`${testIdPrefix}-${c.key}`}
        >
          <span className={`rounded-full ${c.dotClass} ${s.dot}`} />
          {c.short}
        </span>
      ))}
      {remaining > 0 && (
        <span className={`inline-flex items-center font-semibold rounded-full border bg-gray-50 text-gray-600 border-gray-200 ${s.base}`} title={`${remaining} more certifications`}>
          +{remaining}
        </span>
      )}
    </div>
  );
};

export default CertificationBadges;
