import type { UpdateState } from '../../hooks/useUpdate'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  update: Pick<UpdateState, 'confirmingInstall' | 'confirmInstall' | 'cancelInstall'>
}

/** 計測中に更新を押したときの確認ダイアログ（ポップオーバーのバナーと設定画面で共通） */
export function UpdateInstallConfirm({ update }: Props) {
  if (!update.confirmingInstall) return null
  return (
    <ConfirmDialog
      message="作業を保存して更新します。アプリが再起動します。よろしいですか？"
      confirmLabel="更新する"
      confirmVariant="default"
      onConfirm={update.confirmInstall}
      onCancel={update.cancelInstall}
    />
  )
}
