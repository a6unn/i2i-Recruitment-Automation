import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const statusColors: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  DRAFT: 'secondary',
  PARSED: 'warning',
  ACTIVE: 'success',
  CLOSED: 'default',
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [jds, stats] = await Promise.all([
    prisma.jD.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        clientName: true,
        status: true,
        updatedAt: true,
        _count: { select: { candidates: true } },
      },
    }),
    prisma.jD.groupBy({
      by: ['status'],
      where: { userId: session.userId },
      _count: true,
    }),
  ]);

  const totalJDs = stats.reduce((sum, s) => sum + s._count, 0);
  const activeJDs = stats.find((s) => s.status === 'ACTIVE')?._count || 0;
  const parsedJDs = stats.find((s) => s.status === 'PARSED')?._count || 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/jds/new">
          <Button>New JD</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total JDs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalJDs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{activeJDs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Parsed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{parsedJDs}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent JDs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Job Descriptions</CardTitle>
            <Link href="/jds" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {jds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No job descriptions yet.</p>
              <Link href="/jds/new" className="text-primary hover:underline text-sm">
                Create your first JD
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {jds.map((jd) => (
                <Link
                  key={jd.id}
                  href={`/jds/${jd.id}`}
                  className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div>
                    <p className="font-medium">{jd.title}</p>
                    {jd.clientName && (
                      <p className="text-sm text-muted-foreground">{jd.clientName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusColors[jd.status]}>{jd.status}</Badge>
                    {jd._count.candidates > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {jd._count.candidates} candidates
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
