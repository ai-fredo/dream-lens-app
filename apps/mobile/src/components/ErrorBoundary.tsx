import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
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
 * props embedded in the component stack. Sentry crash reporting lands
 * post-launch (out of scope here — see engineering-standards §14); until an
 * error pipeline exists that has been vetted to redact dream content, the
 * safest default is to log nothing at all rather than risk shipping dream
 * text to a log sink. There is intentionally no console.log/console.error
 * call anywhere in this file.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // No logging — see class doc comment above.
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
