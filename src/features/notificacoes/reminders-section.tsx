import { PREF_LABELS, PREF_ORDER, type PrefKind } from '@/domain/notifications'
import { ListCard, ListRow, ListSection } from '@/ui/list'
import { SwitchRow } from '@/ui/switch-row'
import { setNotificationPref } from './actions'
import { PushDevice } from './push-device'

export function RemindersSection({ prefs, hasFamily, vapidPublicKey }: { prefs: Record<PrefKind, boolean>; hasFamily: boolean; vapidPublicKey: string | null }) {
  return (
    <ListSection title="Lembretes">
      <ListCard>
        {PREF_ORDER.filter((kind) => kind !== 'family' || hasFamily).map((kind) => (
          <ListRow key={kind}>
            <SwitchRow
              label={PREF_LABELS[kind]}
              caption={kind === 'daily' ? 'Todo dia às 21h' : undefined}
              checked={prefs[kind]}
              action={setNotificationPref}
              fields={{ kind }}
            />
          </ListRow>
        ))}
        <ListRow>
          <div className="flex flex-col py-2">
            <p className="min-h-8 text-[15px] text-ink">Lembretes neste aparelho</p>
            <PushDevice vapidPublicKey={vapidPublicKey} />
          </div>
        </ListRow>
      </ListCard>
    </ListSection>
  )
}
