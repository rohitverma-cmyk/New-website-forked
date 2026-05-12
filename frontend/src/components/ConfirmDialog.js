/**
 * Reusable confirm dialog shown in-app instead of browser's window.confirm().
 * Renders nothing when `open=false`. Consumers just mount and toggle state.
 *
 *   <ConfirmDialog
 *     open={showDelete}
 *     title="Delete coupon"
 *     message="Are you sure?"
 *     onConfirm={handleDelete}
 *     onCancel={() => setShowDelete(false)}
 *   />
 */
import React from "react";
import { AlertTriangle } from "lucide-react";

const ConfirmDialog = ({
  open,
  title = "Confirm",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default", // default | danger
  onConfirm,
  onCancel,
  busy = false,
  testId = "confirm-dialog",
}) => {
  if (!open) return null;

  const confirmCls =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" data-testid={testId}>
        <div className="p-5 flex items-start gap-3">
          {tone === "danger" ? (
            <div className="w-10 h-10 rounded-full bg-red-100 grid place-items-center flex-shrink-0">
              <AlertTriangle className="text-red-600" size={20} />
            </div>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {message ? (
              <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{message}</p>
            ) : null}
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            data-testid={`${testId}-cancel`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-60 ${confirmCls}`}
            data-testid={`${testId}-confirm`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
