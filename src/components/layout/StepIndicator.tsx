export type Step = 'roster' | 'setup' | 'schedule';

const steps: { key: Step; label: string }[] = [
  { key: 'roster', label: '1. Players' },
  { key: 'setup', label: '2. Setup' },
  { key: 'schedule', label: '3. Schedule' },
];

interface Props {
  current: Step;
}

export function StepIndicator({ current }: Props) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <nav className="flex gap-1 bg-gray-100 p-2 rounded-lg no-print">
      {steps.map((step, i) => {
        const isActive = step.key === current;
        const isCompleted = i < currentIndex;

        return (
          <div
            key={step.key}
            className={`flex-1 text-center py-2 px-3 rounded text-sm font-medium transition-colors ${
              isActive
                ? 'bg-green-600 text-white'
                : isCompleted
                  ? 'bg-green-100 text-green-800'
                  : 'text-gray-400'
            }`}
          >
            {step.label}
          </div>
        );
      })}
    </nav>
  );
}
