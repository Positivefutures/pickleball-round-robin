interface Props {
  ratingDiff: number;
}

export function BalanceIndicator({ ratingDiff }: Props) {
  let color: string;
  let label: string;

  if (ratingDiff <= 0.5) {
    color = 'bg-green-100 text-green-700';
    label = 'Even';
  } else if (ratingDiff <= 1.0) {
    color = 'bg-yellow-100 text-yellow-700';
    label = 'Slight edge';
  } else {
    color = 'bg-red-100 text-red-700';
    label = 'Uneven';
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {label} ({ratingDiff.toFixed(1)})
    </span>
  );
}
