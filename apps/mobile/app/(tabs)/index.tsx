import { MilestoneScreen } from '../../components/MilestoneScreen';

export default function Explore() {
  return (
    <MilestoneScreen
      title="Explore"
      milestone="M2"
      summary="Destination-aware sections and search for the island you have selected."
      requirements={[
        'T-01 Browse without an account',
        'T-02 Switch island and destination',
        'T-03 Only approved, active listings appear',
      ]}
    />
  );
}
