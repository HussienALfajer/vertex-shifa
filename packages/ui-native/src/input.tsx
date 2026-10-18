import { type Ref, useRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { chainStep } from './focus-chain';
import { useTheme } from './theme';

type InputProps = Omit<TextInputProps, 'style'> & { ref?: Ref<TextInput> };

/** A single-line text field with the web design system's shape (6 px radius, 3:1 border). */
export function Input({ ref, ...props }: InputProps) {
  const { colors, space, radius, fontSize } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.mutedForeground}
      {...props}
      style={[
        styles.input,
        {
          paddingInline: space[3],
          borderRadius: radius.md,
          borderColor: colors.input,
          backgroundColor: colors.surface,
          color: colors.foreground,
          fontSize: fontSize.base.size,
        },
      ]}
    />
  );
}

/**
 * Chains a form's single-line fields: the return key reads "next" and moves to the following
 * field, and "done" on the last one runs `onSubmit` (the form's primary action). Spread
 * `field(index)` on each `Input`; a multiline field stays out of the chain, as its return key is
 * a newline.
 */
export function useFocusChain(count: number, onSubmit: () => void) {
  const fields = useRef<(TextInput | null)[]>([]);
  return (index: number) => {
    const { returnKeyType, submitBehavior, last } = chainStep(index, count);
    return {
      ref: (input: TextInput | null) => {
        fields.current[index] = input;
      },
      returnKeyType,
      submitBehavior,
      onSubmitEditing: () => (last ? onSubmit() : fields.current[index + 1]?.focus()),
    } satisfies Partial<InputProps>;
  };
}

const styles = StyleSheet.create({
  // The smallest touch target on both platforms.
  input: { minHeight: 44, borderWidth: 1, textAlign: 'auto' },
});
