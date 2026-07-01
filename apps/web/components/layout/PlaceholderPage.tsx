import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Coming in a future phase</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Phase 0 bootstrap is complete. This page will be implemented in upcoming phases.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
