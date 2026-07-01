import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: '12px' }}>予期しないエラーが発生しました</p>
          <details style={{ marginBottom: '12px', textAlign: 'left', fontSize: '11px' }}>
            <summary style={{ cursor: 'pointer' }}>{error.message}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error.stack}</pre>
          </details>
          <button onClick={() => window.location.reload()}>再読み込み</button>
        </div>
      )
    }
    return this.props.children
  }
}
