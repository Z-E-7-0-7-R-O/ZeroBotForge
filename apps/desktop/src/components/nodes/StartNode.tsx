import FlowNodeCard from "../flow/FlowNode";
import type { FlowNodeCardProps } from "../flow/FlowNode";

export default function StartNode(props: FlowNodeCardProps) {
  return <FlowNodeCard {...props} />;
}
