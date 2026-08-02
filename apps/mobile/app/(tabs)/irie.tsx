import { MilestoneScreen } from '../../components/MilestoneScreen';

export default function IrieAI() {
  return (
    <MilestoneScreen
      title="Irie AI"
      milestone="M7"
      summary="Ask in plain language; get grounded recommendations from real, approved listings only."
      requirements={[
        'Recommends only approved platform inventory',
        'Never invents vendors, prices, hours or availability',
        'Falls back to normal search when AI is unavailable',
      ]}
    />
  );
}
