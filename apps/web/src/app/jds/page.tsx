import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const statusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  DRAFT: 'secondary',
  PARSED: 'warning',
  ACTIVE: 'success',
  CLOSED: 'default',
};

export default async function JDsListPage() {
  const session = await getSession();
  if (!session) return null;

  const jds = await prisma.jD.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      clientName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { candidates: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Job Descriptions</h1>
        <Link href="/jds/new">
          <Button>New JD</Button>
        </Link>
      </div>

      {jds.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">No job descriptions yet.</p>
            <Link href="/jds/new">
              <Button>Create Your First JD</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jds.map((jd) => (
            <Link key={jd.id} href={`/jds/${jd.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{jd.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {jd.clientName && (
                        <span className="text-sm text-muted-foreground">{jd.clientName}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Updated {jd.updatedAt.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusColors[jd.status]}>{jd.status}</Badge>
                    {jd._count.candidates > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {jd._count.candidates} candidates
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
