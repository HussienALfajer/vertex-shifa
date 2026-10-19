'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * The navigation of an app (Vertex Hub's sidebar, §2, §7): links on Vertex Green, the active one
 * with a sand marker at its inline start. `AppFrame` draws it beside the page from the `md`
 * breakpoint and in a sheet below it. The links scroll under the frame's brand row on short
 * screens and phones.
 */
function SidebarNav({ className, ...props }: ComponentProps<'nav'> & { 'aria-label': string }) {
  return (
    <nav
      data-slot="sidebar-nav"
      className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3', className)}
      {...props}
    />
  );
}

/** A titled group of links (the clinic's settings); its title is read before its links. */
function SidebarGroup({
  label,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { label: string }) {
  return (
    <div data-slot="sidebar-group" className={cn('mt-3 flex flex-col gap-1', className)} {...props}>
      <p className="px-3 pb-1 text-xs font-medium text-sidebar-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

const sidebarLinkVariants = cva(
  [
    'relative flex shrink-0 items-center gap-3 rounded-md text-sidebar-muted-foreground transition-colors duration-150 ease-out',
    'hover:bg-sidebar-hover hover:text-sidebar-foreground',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
    // The router marks the current page with `aria-current="page"`.
    'aria-[current=page]:bg-sidebar-active aria-[current=page]:font-medium aria-[current=page]:text-sidebar-foreground',
    'before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:bg-sidebar-marker before:opacity-0 aria-[current=page]:before:opacity-100',
  ],
  {
    variants: {
      size: {
        md: 'h-10 px-3 text-base',
        sm: 'h-9 px-3 text-sm',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

type SidebarLinkProps = useRender.ComponentProps<'a'> & VariantProps<typeof sidebarLinkVariants>;

/** One link of the sidebar; render the router's link: `<SidebarLink render={<Link to="/" />}>`. */
function SidebarLink({ className, size, render, ...props }: SidebarLinkProps) {
  return useRender({
    defaultTagName: 'a',
    render,
    props: mergeProps<'a'>({ className: cn(sidebarLinkVariants({ size }), className) }, props),
    state: { slot: 'sidebar-link' },
  });
}

export { SidebarGroup, SidebarLink, type SidebarLinkProps, SidebarNav, sidebarLinkVariants };
