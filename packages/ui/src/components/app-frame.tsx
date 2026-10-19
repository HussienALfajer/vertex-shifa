'use client';

import { MenuIcon } from 'lucide-react';
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { AscentLines } from '../brand/ascent-lines';
import { VertexShifaLogo, VertexShifaMark } from '../brand/logo';
import { cn } from '../lib/cn';
import { Button } from './button';
import { PageContainer } from './page-container';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet';
import { ThemeToggle } from './theme-toggle';

/** The `md` breakpoint (Tailwind's 48rem): the sidebar sits beside the page from this width. */
const sidebarQuery = '(min-width: 48rem)';

interface FrameLabels {
  /** "Vertex Shifa": always visible (ADR 0018). */
  productName: string;
  /** The app's name under it ("Clinic", "Platform console"). */
  productLabel: string;
  /** "Powered by Vertex Shifa", in the footer of every screen. */
  poweredBy: string;
  toDark: string;
  toLight: string;
}

interface AppFrameProps {
  labels: FrameLabels & {
    /** The skip link to the page, the first stop of the keyboard (WCAG 2.4.1). */
    skipToContent: string;
    /** The button that opens the navigation on phones. */
    openNavigation: string;
    /** The navigation sheet's accessible title. */
    navigation: string;
  };
  /** The app's `SidebarNav`. Without it (a gate still loading) the frame shows no navigation. */
  navigation?: ReactNode;
  /** The signed-in person's controls, before the theme toggle at the inline end of the top bar. */
  headerEnd?: ReactNode;
  children: ReactNode;
}

/** The brand row: the sand mark and the product's names, on Vertex Green or on the surface. */
function Brand({ labels, onSidebar }: { labels: FrameLabels; onSidebar: boolean }) {
  return (
    // The product's name never shrinks (ADR 0018: "Vertex" always visible); the app's name may.
    <span className="flex min-w-0 items-center gap-2 sm:gap-3">
      <VertexShifaMark className={cn('w-7', onSidebar ? 'text-sidebar-marker' : 'text-primary')} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-lg font-bold whitespace-nowrap">{labels.productName}</span>
        <span
          className={cn(
            'truncate text-sm',
            onSidebar ? 'text-sidebar-muted-foreground' : 'text-muted-foreground',
          )}
        >
          {labels.productLabel}
        </span>
      </span>
    </span>
  );
}

function Sidebar({ labels, children }: { labels: FrameLabels; children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground [--ring:var(--sidebar-ring)]">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
        <Brand labels={labels} onSidebar />
      </div>
      {children}
    </div>
  );
}

/**
 * The frame of every signed-in screen (Vertex Hub's shell): the sidebar at the inline start from
 * the `md` breakpoint, in a sheet opened from the top bar below it; the top bar with the person's
 * controls and the theme toggle, and the page, in one `PageContainer` column, so their edges line
 * up; "Powered by Vertex Shifa" under it. Nothing in it is wider than the window, from a 320 px phone to a wide screen.
 */
function AppFrame({ labels, navigation, headerEnd, children }: AppFrameProps) {
  const [open, setOpen] = useState(false);
  // A window widened past the breakpoint shows the sidebar itself: the sheet closes.
  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(sidebarQuery);
    const close = () => query.matches && setOpen(false);
    query.addEventListener('change', close);
    return () => query.removeEventListener('change', close);
  }, [open]);
  // Following a link in the sheet closes it, whatever router renders the link.
  const closeOnLink = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false);
  };

  return (
    <div className="flex min-h-dvh bg-background">
      {/* The first stop of the keyboard. A button, not a "#main" link: a hash change would add a
          history entry and reach the router's blockers. */}
      <button
        type="button"
        onClick={() => document.getElementById('main')?.focus()}
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-surface focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-float"
      >
        {labels.skipToContent}
      </button>
      {navigation && (
        <aside data-slot="app-sidebar" className="sticky top-0 hidden h-dvh w-64 shrink-0 md:flex">
          <Sidebar labels={labels}>{navigation}</Sidebar>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-slot="app-top-bar"
          className="sticky top-0 z-40 shrink-0 border-b border-border bg-surface"
        >
          {/* The page's column: the top bar's controls line up with the page's edges. */}
          <PageContainer className="flex h-16 items-center gap-2">
            {navigation && (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-ms-2 md:hidden"
                      aria-label={labels.openNavigation}
                    />
                  }
                >
                  <MenuIcon />
                </SheetTrigger>
                <SheetContent onClick={closeOnLink}>
                  <SheetTitle className="sr-only">{labels.navigation}</SheetTitle>
                  <Sidebar labels={labels}>{navigation}</Sidebar>
                </SheetContent>
              </Sheet>
            )}
            {/* With the sidebar beside the page, the brand is in it. */}
            <div className={cn('min-w-0', navigation && 'md:hidden')}>
              <Brand labels={labels} onSidebar={false} />
            </div>
            <div className="ms-auto flex shrink-0 items-center gap-1">
              {headerEnd}
              <ThemeToggle labels={labels} />
            </div>
          </PageContainer>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 py-6 outline-none md:py-8">
          <PageContainer>{children}</PageContainer>
        </main>
        <footer className="border-t border-border">
          <PageContainer className="py-3 text-sm text-muted-foreground">
            {labels.poweredBy}
          </PageContainer>
        </footer>
      </div>
    </div>
  );
}

interface AuthFrameProps {
  labels: FrameLabels & {
    /** The line under the logo on the brand panel. */
    tagline: string;
  };
  children: ReactNode;
}

/**
 * The frame of the screens before a session (Vertex Hub's sign-in layout): the form in one
 * column, the full logo in sand on Vertex Green beside it from the `lg` breakpoint (approved
 * colorway, §7). Phones and tablets show the brand row above the form instead.
 */
function AuthFrame({ labels, children }: AuthFrameProps) {
  return (
    <div className="relative grid min-h-dvh bg-background lg:grid-cols-2">
      {/* Over the form, never on the brand panel. */}
      <ThemeToggle labels={labels} className="absolute start-4 top-4 z-10" />
      <div className="flex min-w-0 flex-col">
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 justify-center px-4 py-16 outline-none sm:px-6 lg:items-center lg:py-12"
        >
          <div className="flex w-full max-w-xl min-w-0 flex-col gap-8">
            <div className="lg:hidden">
              <Brand labels={labels} onSidebar={false} />
            </div>
            {children}
          </div>
        </main>
        <footer className="px-4 py-3 text-center text-sm text-muted-foreground sm:px-6">
          {labels.poweredBy}
        </footer>
      </div>
      <aside
        data-slot="auth-brand-panel"
        className="relative hidden flex-col items-center justify-center gap-8 overflow-hidden bg-sidebar p-12 lg:flex"
      >
        <AscentLines className="absolute inset-y-0 end-0 h-full w-1/4 text-sidebar-marker opacity-20" />
        <VertexShifaLogo label={labels.productName} className="relative w-56 text-sidebar-marker" />
        <p className="relative max-w-sm text-center text-lg text-sidebar-muted-foreground">
          {labels.tagline}
        </p>
      </aside>
    </div>
  );
}

export { AppFrame, type AppFrameProps, AuthFrame, type AuthFrameProps };
