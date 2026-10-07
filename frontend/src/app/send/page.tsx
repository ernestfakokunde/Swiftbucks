import { FlowForm } from "@/components/FlowForm";
import { LayoutShell } from "@/components/LayoutShell";

export default function SendPage() {
  return (
    <LayoutShell>
      <FlowForm mode="send" />
    </LayoutShell>
  );
}
