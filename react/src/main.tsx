/**
 * Purpose: Implementation module for main in the react domain.
 */
import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { startPwa } from './pwa/client';

startPwa(import.meta.env.PROD);

class RootErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Root error boundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        padding: 24,
                        fontFamily: 'system-ui, sans-serif',
                        background: '#fef2f2',
                        minHeight: '100vh',
                        color: '#991b1b',
                    }}
                >
                    <h2>Something went wrong</h2>
                    <pre
                        style={{
                            whiteSpace: 'pre-wrap',
                            fontSize: 12,
                            background: '#fff',
                            padding: 12,
                            borderRadius: 8,
                            maxHeight: '70vh',
                            overflow: 'auto',
                        }}
                    >
                        {String(this.state.error?.message)}
                        {'\n'}
                        {String(this.state.error?.stack)}
                    </pre>
                    <button
                        onClick={() =>
                            this.setState({ hasError: false, error: null })
                        }
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <RootErrorBoundary>
            <App />
        </RootErrorBoundary>
    </React.StrictMode>,
);
