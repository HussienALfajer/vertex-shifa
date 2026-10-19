import { ArrowRightIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { Button, type ButtonProps } from './button';

/**
 * The column of a screen's content (in `AppFrame`, beside the sidebar): full width with a 16 px
 * gutter on phones, 32 px from the `md` breakpoint, at most 72rem wide on large screens.
 */
function PageContainer({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-container"
      className={cn('mx-auto w-full max-w-6xl px-4 md:px-8', className)}
      {...props}
    />
  );
}

/**
 * The way back from a sub-page, above its title (the desktop app has no browser Back button). The
 * arrow points to the inline start: right in Arabic. Its label names where it goes.
 */
function BackButton({ className, children, ...props }: ButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ms-3 w-fit text-muted-foreground hover:text-foreground', className)}
      {...props}
    >
      <ArrowRightIcon aria-hidden className="ltr:rotate-180" />
      {children}
    </Button>
  );
}

export { BackButton, PageContainer };
