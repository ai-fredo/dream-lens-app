import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
import { captureError } from '../services/telemetry';
import { OutlinedButton } from './OutlinedButton';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level render-error boundary (engineering-standards §5).
 *
 * The app must never show a blank white screen: any uncaught render error
 * anywhere in the tree below this boundary falls back to this screen
 * instead of crashing/blanking the app.
 *
 * Deliberately does NOT log anything content-bearing. `componentDidCatch`
 * receives the thrown `Error` and a React `errorInfo.componentStack`, but a
 * dream-content bug (e.g. a malformed transcript rendered into a component
 * that throws) can carry that dream text into the error message or into
 * props embedded in the component stack. There is intentionally no
 * console.log/console.error call anywhere in this file, and only the
 * `Error` object itself — never `errorInfo` or the children's props/state —
 * is forwarded to captureError(), which further redacts any dream-content
 * keys before anything reaches Sentry (see services/telemetry.ts).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    // Only the caught Error object goes to telemetry — never errorInfo
    // (its componentStack can embed child props) and never console logging.
    captureError(error);
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View testID="error-boundary-fallback" style={styles.container}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.body}>Your dreams are safe. Restart to continue.</Text>
          <View style={styles.action}>
            <OutlinedButton label="Try again" onPress={this.handleReset} />
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.base,
    paddingHorizontal: Spacing[8],
    gap: Spacing[3],
  },
  title: {
    ...Typography.display.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  body: {
    ...Typography.body.md,
    color: Colors.text.muted,
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing[4],
    alignSelf: 'stretch',
  },
});
