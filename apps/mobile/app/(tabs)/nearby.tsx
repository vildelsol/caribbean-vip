import { MilestoneScreen } from '../../components/MilestoneScreen';

export default function Nearby() {
  return (
    <MilestoneScreen
      title="Nearby"
      milestone="M2 · M6"
      summary="List and map of what is around you, with manual discovery when location is denied."
      requirements={[
        'T-07 Offers only after location permission and offer opt-in',
        'T-08 Save an offer voucher without booking',
        'Manual nearby discovery always available',
      ]}
    />
  );
}
