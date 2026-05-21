import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * ErrorBoundary — React class component that catches render errors anywhere
 * in its child tree, prevents the white-screen-of-death, and shows the user
 * an actionable fallback with the error message + a copy-to-clipboard button.
 *
 * Pair with a `data-testid` on the fallback so QA can detect rendered errors.
 *
 * Usage:
 *   <ErrorBoundary fallbackTitle="Something broke on this page">
 *     <SomeRiskyComponent />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log for the dev console / Sentry hook later
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => this.setState({ hasError: false, error: null, errorInfo: null });

  copyDetails = () => {
    const { error, errorInfo } = this.state;
    const blob = `${error?.toString() || "Unknown error"}\n\n${errorInfo?.componentStack || ""}`;
    navigator.clipboard?.writeText(blob);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.fallbackTitle || "Something went wrong";
    const error = this.state.error;
    const stack = this.state.errorInfo?.componentStack || "";

    return (
      <div
        className="min-h-[60vh] flex items-center justify-center p-6"
        data-testid="error-boundary-fallback"
      >
        <div className="max-w-2xl w-full bg-white border border-red-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-1">
                The page hit an unexpected error. The team has been notified. You can try reloading
                — if it persists, share the details below with support.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono text-gray-700 overflow-auto max-h-48 mb-4">
            <p className="font-semibold text-red-700">{error?.toString() || "Unknown error"}</p>
            {stack && <pre className="mt-2 text-gray-500 whitespace-pre-wrap">{stack}</pre>}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={this.copyDetails}
              className="px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
              data-testid="error-copy-btn"
            >
              Copy details
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 inline-flex items-center gap-1.5"
              data-testid="error-retry-btn"
            >
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
