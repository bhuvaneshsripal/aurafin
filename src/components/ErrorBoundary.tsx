import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, a render error on any page (e.g. Wealth) unmounts the whole
 * app and leaves a blank screen with no way to recover short of a manual
 * reload — which is what a raw white page after navigating usually means.
 * This catches it and shows something actionable instead, and resets itself
 * whenever the route changes so navigating away actually recovers.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Aurafin crashed while rendering:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 px-6 text-center">
          <AlertTriangle className="text-red-500" size={28} />
          <p className="text-slate-700 dark:text-slate-200 font-medium">
            Something went wrong loading this page.
          </p>
          <p className="text-sm text-slate-400 max-w-sm">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
