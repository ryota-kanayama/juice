import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  message,
  confirmLabel = '確認',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open onOpenChange={open => { if (!open) onCancel() }}>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogTitle>{message}</AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
