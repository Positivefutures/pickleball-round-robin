import * as stores from '../lib/stores';
import { useStoredValue } from './useStoredValue';

/**
 * Which groups are being shared right now.
 *
 * More than one can be, and that is the whole reason this exists. A host who
 * sets three of tomorrow's groups up tonight and sends three QR codes out has
 * three live shares; two of them are parked, and the only record of those is
 * the key filed with each group's session. See groupSessions.ts.
 *
 * The live slot wins for the group in front. `stores.shareKey` is what the
 * publisher actually holds, and the parked record for the open group is
 * whatever was true when it was last put down — stale by exactly one Stop
 * Sharing, which is the case that matters.
 */
export function useLiveGroups(): Set<string> {
  const [parked] = useStoredValue(stores.groupSessions);
  const [openKey] = useStoredValue(stores.shareKey);
  const [activeId] = useStoredValue(stores.activeRosterId);

  const ids = new Set<string>();
  for (const [id, session] of Object.entries(parked)) {
    if (session.shareKey) ids.add(id);
  }
  if (activeId) {
    if (openKey) ids.add(activeId);
    else ids.delete(activeId);
  }
  return ids;
}
