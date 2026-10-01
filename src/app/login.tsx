import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, type IconName } from '@/components/Button';
import { Focusable } from '@/components/Focusable';
import { Wordmark } from '@/components/Logo';
import { PosterWall } from '@/components/PosterWall';
import { useLayout } from '@/lib/layout';
import { usePlaylist } from '@/lib/playlist-store';
import { colors, fonts } from '@/lib/theme';

export default function LoginScreen() {
  const { connect } = usePlaylist();
  const { s, wide } = useLayout();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const signIn = async () => {
    if (busy) return;
    const user = username.trim();
    if (!user || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // On success the signed-in routes unlock and the router leaves this screen.
      await connect({ username: user, password });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <PosterWall />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + s(24),
              paddingBottom: insets.bottom + s(24),
              paddingHorizontal: s(20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.card,
              wide && styles.cardWide,
              { maxWidth: s(440), padding: wide ? s(40) : s(4), borderRadius: s(24) },
            ]}
          >
            <View style={[styles.brand, { marginBottom: s(wide ? 36 : 44) }]}>
              <Wordmark size={s(64)} stacked />
            </View>

            <Text style={[styles.title, { fontSize: s(28), marginBottom: s(22) }]}>Sign In</Text>

            <Field
              icon="person-outline"
              placeholder="Username"
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              inputRef={passwordRef}
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={signIn}
              trailing={
                <Focusable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  zoom={1.15}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={styles.eye}
                >
                  {({ focused }) => (
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={s(20)}
                      color={focused ? colors.text : colors.textMuted}
                    />
                  )}
                </Focusable>
              }
            />

            {error && (
              <View style={[styles.error, { padding: s(12), borderRadius: s(12), marginTop: s(4) }]} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={s(18)} color={colors.danger} />
                <Text style={[styles.errorText, { fontSize: s(14), lineHeight: s(20) }]}>{error}</Text>
              </View>
            )}

            <Button
              label={busy ? 'Signing in…' : 'Sign In'}
              onPress={signIn}
              busy={busy}
              size="lg"
              style={{ marginTop: s(20) }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  icon,
  trailing,
  inputRef,
  ...props
}: TextInputProps & { icon: IconName; trailing?: ReactNode; inputRef?: RefObject<TextInput | null> }) {
  const { s } = useLayout();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        { height: s(56), borderRadius: s(14), paddingHorizontal: s(16), gap: s(12), marginBottom: s(14) },
        focused && styles.fieldFocused,
      ]}
    >
      <Ionicons name={icon} size={s(20)} color={focused ? colors.text : colors.textMuted} />
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.textDim}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, { fontSize: s(16) }]}
      />
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%' },
  cardWide: {
    backgroundColor: 'rgba(14,14,20,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0px 30px 80px rgba(0,0,0,0.55)',
  },
  brand: { alignItems: 'center' },
  title: { color: colors.text, fontFamily: fonts.bold },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fieldFocused: { borderColor: colors.accent, backgroundColor: 'rgba(255,36,71,0.06)' },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    color: colors.text,
    fontFamily: fonts.medium,
    paddingVertical: 0,
    outlineWidth: 0,
  },
  eye: { padding: 4, borderRadius: 20 },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255,92,99,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,92,99,0.3)',
  },
  errorText: { flex: 1, color: colors.text, fontFamily: fonts.medium },
});
