import { FlowForm } from "@/components/FlowForm";
import { LayoutShell } from "@/components/LayoutShell";

export default function WithdrawPage() {
  return (
    <LayoutShell>
      <FlowForm mode="withdraw" />
    </LayoutShell>
  );
}
