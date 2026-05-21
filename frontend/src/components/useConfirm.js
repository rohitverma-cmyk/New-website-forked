/**
 * Promise-based replacements for the native window.confirm() and window.prompt().
 *
 * Why a hook + provider? Each admin page has 1-6 destructive call-sites.
 * Lifting state to component-local useState would mean adding boilerplate
 * (open flag, async-handler wiring, busy state, error toasts) to every
 * delete/reject/migrate handler. With this provider the call-site stays
 * one line:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete coupon", message: "..." }))) return;
 *   await doDelete();
 *
 * The provider mounts a single <ConfirmDialog> for the whole app. Multiple
 * concurrent calls are queued (FIFO) — one prompt at a time, mimicking
 * native browser behaviour.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import ConfirmDialog from "./ConfirmDialog";

const ConfirmCtx = createContext(null);
const InputCtx = createContext(null);

export const ConfirmProvider = ({ children }) => {
  // ── confirm() state ──
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({
        title: opts.title || "Confirm",
        message: opts.message || "",
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
        tone: opts.tone || "default",
      });
    });
  }, []);

  const settle = (value) => {
    confirmResolverRef.current?.(value);
    confirmResolverRef.current = null;
    setConfirmState(null);
  };

  // ── input() state — Promise<string|null> ──
  const [inputState, setInputState] = useState(null);
  const inputResolverRef = useRef(null);

  const promptInput = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      inputResolverRef.current = resolve;
      setInputState({
        title: opts.title || "Enter value",
        message: opts.message || "",
        placeholder: opts.placeholder || "",
        defaultValue: opts.defaultValue || "",
        confirmLabel: opts.confirmLabel || "OK",
        cancelLabel: opts.cancelLabel || "Cancel",
        validate: opts.validate || null,
      });
    });
  }, []);

  const settleInput = (value) => {
    inputResolverRef.current?.(value);
    inputResolverRef.current = null;
    setInputState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      <InputCtx.Provider value={promptInput}>
        {children}
        <ConfirmDialog
          open={!!confirmState}
          title={confirmState?.title}
          message={confirmState?.message}
          confirmLabel={confirmState?.confirmLabel}
          cancelLabel={confirmState?.cancelLabel}
          tone={confirmState?.tone}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
          testId="app-confirm-dialog"
        />
        <InputDialog
          state={inputState}
          onSubmit={(v) => settleInput(v)}
          onCancel={() => settleInput(null)}
        />
      </InputCtx.Provider>
    </ConfirmCtx.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
};

export const useInputDialog = () => {
  const ctx = useContext(InputCtx);
  if (!ctx) throw new Error("useInputDialog must be used inside <ConfirmProvider>");
  return ctx;
};

// Single text input dialog — replaces window.prompt().
const InputDialog = ({ state, onSubmit, onCancel }) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  // Reset value whenever a new prompt opens.
  React.useEffect(() => {
    if (state) {
      setValue(state.defaultValue || "");
      setError("");
    }
  }, [state]);

  if (!state) return null;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (state.validate) {
      const err = state.validate(trimmed);
      if (err) { setError(err); return; }
    }
    onSubmit(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" data-testid="app-input-dialog">
        <div className="p-5">
          <h3 className="text-base font-semibold text-gray-900">{state.title}</h3>
          {state.message && <p className="mt-1 text-sm text-gray-600">{state.message}</p>}
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); if (error) setError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder={state.placeholder}
            className={`mt-4 w-full px-3 py-2 border rounded-lg focus:outline-none text-sm ${
              error ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-blue-500"
            }`}
            data-testid="app-input-dialog-input"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            data-testid="app-input-dialog-cancel"
          >
            {state.cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium bg-blue-600 hover:bg-blue-700"
            data-testid="app-input-dialog-confirm"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
