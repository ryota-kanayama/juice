import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStatus } from '../../hooks/useAuthStatus'

/** Slack サインイン状態の表示と操作（設定 > アカウント） */
export function AccountSection() {
  const { status, signIn, signOut } = useAuthStatus()

  return (
    <Card className="mb-4">
      <CardContent className="flex items-center justify-between gap-3 p-3.5">
        {status.signedIn ? (
          <>
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {status.name} としてサインイン中
              </p>
              {status.expiresAt && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  有効期限: {new Date(status.expiresAt).toLocaleDateString('ja-JP')}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>サインアウト</Button>
          </>
        ) : (
          <>
            <div>
              <p className="text-[13px] font-medium text-foreground">未サインイン</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                社内連携 API の利用に必要です
              </p>
            </div>
            <Button size="sm" onClick={signIn}>Slack でサインイン</Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
