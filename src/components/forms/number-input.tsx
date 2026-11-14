import type { ComponentProps } from 'react';
import { sanitizeNumberText, type NumberFormat } from '@/utils/numbers';
import { Input } from './controls';

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'inputMode'> & NumberFormat & {
  value: string;
  onValueChange: (text: string) => void;
};

/**
 * Champ numérique : les lettres sont refusées à la frappe et au collage ;
 * en mode `decimal`, la virgule (ou le point) est acceptée. La valeur est un TEXTE (« 2,5 ») :
 * la convertir avec `parseNumberText`.
 */
export function NumberInput({ value, onValueChange, decimal, maxDecimals, negative, ...rest }: Props) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      onChange={(e) => onValueChange(sanitizeNumberText(e.target.value, { decimal, maxDecimals, negative }))}
    />
  );
}
