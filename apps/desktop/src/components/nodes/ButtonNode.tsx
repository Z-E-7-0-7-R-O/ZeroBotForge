import FlowNodeCard from "../flow/FlowNode";
import type { FlowNodeCardProps } from "../flow/FlowNode";

export default function ButtonNode(props: FlowNodeCardProps) {
  return <FlowNodeCard {...props} />;
}
