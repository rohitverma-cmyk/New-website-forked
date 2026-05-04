/**
 * One-line legal note shown alongside certification chips/filters.
 */
import React from "react";
import { Info } from "lucide-react";

const CertificationDisclaimer = ({ className = "", testId = "cert-disclaimer" }) => (
  <p
    className={`flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5 ${className}`}
    data-testid={testId}
  >
    <Info size={12} className="flex-shrink-0 text-amber-700" />
    <span>
      Certifications are owned by respective partner mills; Locofast is a sourcing partner. Documents available on request.
    </span>
  </p>
);

export default CertificationDisclaimer;
