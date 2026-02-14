interface Props {
  ratingDiff: number;
}

export function BalanceIndicator({ ratingDiff }: Props) {
  let color: string;

  if (ratingDiff <= 0.2) {
    color = 'bg-green-100 text-green-700';
  } else if (ratingDiff <= 0.4) {
    color = 'bg-yellow-100 text-yellow-700';
  } else {
    color = 'bg-red-100 text-red-700';
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      Diff {ratingDiff.toFixed(1)}
    </span>
  );
}
