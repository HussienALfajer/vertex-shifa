import { Card, PageHeader } from '@vertex-shifa/ui';
import type { ComponentProps, ReactNode } from 'react';

/** The card of a screen state (home, not found, error). */
export function StateCard({
  title,
  description,
  action,
  ...props
}: Omit<ComponentProps<'section'>, 'title' | 'className'> & {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="mx-auto mt-6 max-w-2xl" {...props}>
      <Card>
        <PageHeader title={title} description={description} />
        {action && <div className="ps-4">{action}</div>}
      </Card>
    </section>
  );
}
