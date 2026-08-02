import { MilestoneScreen } from '../../components/MilestoneScreen';

export default function Profile() {
  return (
    <MilestoneScreen
      title="Profile"
      milestone="M1 · M6"
      summary="Preferences, saved items, currency, language, notifications and privacy controls."
      requirements={[
        'Turn location-based offers off at any time',
        'Clear Irie AI history',
        'Guest mode with no account required',
      ]}
    />
  );
}
