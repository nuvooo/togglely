import { AlertTriangle } from 'lucide-react'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { withTranslation } from 'react-i18next'
import type { WithTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryComponent extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                {t('errors.boundary.title')}
              </h1>
              <p className="text-muted-foreground">
                {t('errors.boundary.message')}
              </p>
            </div>
            <Button onClick={this.handleReload} variant="default" size="lg">
              {t('errors.boundary.reload')}
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const ErrorBoundary = withTranslation()(ErrorBoundaryComponent)
export default ErrorBoundary
