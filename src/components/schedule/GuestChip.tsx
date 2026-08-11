import type { Player } from '../../types';

/**
 * Marks somebody playing this session who is not in the group.
 *
 * getDisplayName() never distinguishes two people with the same name, so a guest
 * called Dave and the group's Dave read identically on a court. This is what
 * tells them apart, and it is also the only reminder the host gets that the
 * guest will not be there next week.
 *
 * Screen only. A printed sheet is for reading out at the net, where whose group
 * somebody is in does not come up.
 */
export function GuestChip({ player }: { player: Player }) {
  if (!player.guest) return null;
  return (
    <span
      className="no-print shrink-0 rounded bg-[#DFF2F4] px-1 py-px text-[0.6rem]
                 font-bold uppercase tracking-wide text-[#0A6E85]"
      title={`${player.name} is playing as a guest and is not in this group`}
    >
      Guest
    </span>
  );
}
