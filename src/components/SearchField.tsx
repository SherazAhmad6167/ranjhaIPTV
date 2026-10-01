import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors, fonts } from '@/lib/theme';

import { Focusable } from './Focusable';

interface Props {
  value: string;
  onChangeText(text: string): void;
  placeholder: string;
  autoFocus?: boolean;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SearchField({ value, onChangeText, placeholder, autoFocus, large, style }: Props) {
  const { s } = useLayout();
  const [focused, setFocused] = useState(false);
  const height = s(large ? 50 : 44);
  return (
    <View
      style={[
        styles.box,
        { height, borderRadius: s(12), paddingHorizontal: s(14), gap: s(10) },
        focused && styles.focused,
        style,
      ]}
    >
      <Ionicons name="search" size={s(large ? 20 : 18)} color={focused ? colors.text : colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { fontSize: s(large ? 17 : 15) }]}
      />
      {value.length > 0 && (
        <Focusable
          onPress={() => onChangeText('')}
          hitSlop={10}
          zoom={1.15}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={s(20)} color={colors.textMuted} />
        </Focusable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  focused: { borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.1)' },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    color: colors.text,
    fontFamily: fonts.medium,
    paddingVertical: 0,
    outlineWidth: 0,
  },
});
