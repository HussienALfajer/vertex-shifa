import type { ComponentProps } from 'react';
import { encode } from 'uqr';
import { cn } from '../lib/cn';

type QrCodeProps = Omit<ComponentProps<'svg'>, 'children' | 'viewBox'> & {
  /** The text the code holds, e.g. an `otpauth://` URI. */
  value: string;
  /** What the code is, for screen readers. */
  label: string;
};

/**
 * A QR code drawn as SVG modules. Dark on white in both themes: phone scanners expect it, so its
 * colors do not follow the dark theme.
 */
function QrCode({ value, label, className, ...props }: QrCodeProps) {
  const { size, data } = encode(value, { ecc: 'M', border: 2 });
  const modules = data.flatMap((row, y) =>
    row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])),
  );
  return (
    <svg
      data-slot="qr-code"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('size-48 rounded-md bg-white text-green-950', className)}
      {...props}
    >
      <path d={modules.join('')} fill="currentColor" />
    </svg>
  );
}

export { QrCode, type QrCodeProps };
