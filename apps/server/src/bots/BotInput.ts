import type { OrchestrationV2ConversationMessage } from "@satslab/contracts";

export function botMessageText(
  message: Pick<OrchestrationV2ConversationMessage, "text" | "createdBy" | "senderThreadId">,
) {
  if (message.createdBy !== "agent" || message.senderThreadId === undefined) return message.text;
  return `Message from another Blobs agent (not the user):\n${JSON.stringify({ senderThreadId: message.senderThreadId })}\n\n${message.text}`;
}
