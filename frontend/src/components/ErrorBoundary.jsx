import React from 'react'

/**
 * Catches JavaScript errors anywhere in the child component tree and shows
 * a fallback UI instead of a blank gray screen. Without this, one undefined
 * function or null-access crashes the entire React app.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Log for debugging; visible in browser console
    console.error('ErrorBoundary caught:', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="border-2 border-warn bg-warn/10 p-4 m-4 space-y-3">
          <div className="font-display text-2xl tracking-wider text-warn">
            SOMETHING BROKE
          </div>
          <div className="font-mono text-xs text-ink/80 break-words">
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="border-2 border-ink px-3 py-2 font-mono text-xs uppercase tracking-wider hover:bg-ink hover:text-paper transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="border-2 border-ink px-3 py-2 font-mono text-xs uppercase tracking-wider hover:bg-ink hover:text-paper transition-colors"
            >
              Reload app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
