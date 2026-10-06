import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { Sidebar } from "@/components/app/sidebar";
import { ChatShell } from "@/components/chat/chat-shell";

const BOT_ID = "00000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000002";

const messages: UIMessage[] = [
  {
    id: "qa-user-message",
    role: "user",
    parts: [{ type: "text", text: "Summarize the main obligations and show me the evidence." }],
  },
  {
    id: "qa-assistant-message",
    role: "assistant",
    parts: [{
      type: "text",
      text: "The document creates three obligations worth reviewing. The first is a 30-day notice requirement [S1](/app/sources/00000000-0000-4000-8000-000000000004). The second is a reporting duty tied to the review period. The third is a record-retention requirement.\n\n### What to check next\n\n- Confirm the effective date.\n- Verify whether any exception applies.\n- Keep the cited source with the working notes.",
    }],
  },
];

export default function WorkspaceQaPage() {
  if (process.env.CITERAL_QA_MODE !== "true") notFound();

  const assistants = [
    { id: BOT_ID, name: "Document Analyst", bot_type: "general" },
    { id: "00000000-0000-4000-8000-000000000010", name: "Health Assistant", bot_type: "health" },
    { id: "00000000-0000-4000-8000-000000000011", name: "Legal Research Assistant", bot_type: "legal" },
    { id: "00000000-0000-4000-8000-000000000012", name: "Portfolio Manager Assistant", bot_type: "portfolio" },
    { id: "00000000-0000-4000-8000-000000000013", name: "Study Assistant", bot_type: "study" },
    { id: "00000000-0000-4000-8000-000000000014", name: "Tax & Accounting Assistant", bot_type: "accounting" },
  ];
  const conversations = [
    {
      id: CONVERSATION_ID,
      title: "Agreement review",
      bot_id: BOT_ID,
      bot_name: "Document Analyst",
      archived_at: null,
      last_message_at: new Date(0).toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-000000000020",
      title: "Quarterly report comparison",
      bot_id: BOT_ID,
      bot_name: "Document Analyst",
      archived_at: null,
      last_message_at: new Date(0).toISOString(),
    },
  ];

  return (
    <div className="min-h-dvh bg-background lg:flex">
      <Sidebar assistants={assistants} conversations={conversations} email="qa@citeral.local" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-2.5 py-2.5 sm:px-4 sm:py-4 lg:px-5 lg:py-5 xl:px-7 xl:py-7 2xl:px-8">
          <ChatShell
            bot={{
              id: BOT_ID,
              name: "Document Analyst",
              description: "QA fixture",
              bot_type: "general",
              web_enabled: false,
              jurisdiction_country: null,
              jurisdiction_region: null,
            }}
            conversationId={CONVERSATION_ID}
            initialMessages={messages}
            initialAttachments={[{
              id: "00000000-0000-4000-8000-000000000003",
              name: "sample-agreement-with-a-long-filename.pdf",
              status: "ready",
              mimeType: "application/pdf",
            }]}
            starterPrompts={[
              "Summarize the key points in my sources.",
              "Compare the uploaded documents and highlight conflicts.",
              "Explain this topic in plain language.",
              "Research the key considerations for this question.",
            ]}
            welcomeTitle="Analyze documents or ask a question"
            welcomeBody="Upload reports, contracts, PDFs and notes when you want source-specific analysis."
            placeholder="Ask a question or attach documents"
          />
        </div>
      </main>
    </div>
  );
}
