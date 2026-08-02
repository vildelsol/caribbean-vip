import { MilestoneScreen } from '../../components/MilestoneScreen';

export default function Trips() {
  return (
    <MilestoneScreen
      title="Trips"
      milestone="M3"
      summary="Upcoming, completed, cancelled and saved itinerary items, each with its QR voucher."
      requirements={[
        'T-05 Stripe test payment creates a booking exactly once',
        'T-06 Paid booking shows a scannable QR voucher',
        'T-09 Cancel where the policy allows',
      ]}
    />
  );
}
