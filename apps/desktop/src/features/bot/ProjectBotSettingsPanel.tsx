import { useState } from "react";
import { Bot, FolderOpen } from "lucide-react";
import EmptyState from "../../components/common/EmptyState";
import { useProject } from "../../hooks/useProject";
import type { TelegramConnectionStatus } from "../../types/electron-api";
import { BotSettings } from "./BotSettings";
import { BotTokenSettings } from "./BotTokenSettings";

export function ProjectBotSettingsPanel() {
  const { session, updateDocument, saveProject } = useProject();
  const [connectionStatus, setConnectionStatus] =
    useState<TelegramConnectionStatus | null>(null);

  if (!session) {
    return (
      <div className="p8-settings-bot-grid">
        <section className="p8-feature-card">
          <EmptyState
            icon={<FolderOpen size={22} />}
            title="No project is open"
            description="Open or create a project before changing its bot configuration."
          />
        </section>
        <BotTokenSettings onStatusChange={setConnectionStatus} />
      </div>
    );
  }

  return (
    <div className="p8-settings-bot-grid">
      <BotSettings
        key={`${session.document.id}:${session.document.updatedAt}`}
        bot={session.document.bot}
        verifiedUsername={connectionStatus?.botUsername}
        onSave={async (bot) => {
          const nextDocument = {
            ...session.document,
            bot,
            updatedAt: new Date().toISOString(),
          };
          updateDocument(nextDocument);
          if (session.filePath) {
            await saveProject({
              ...session,
              document: nextDocument,
            });
          }
        }}
      />

      <BotTokenSettings onStatusChange={setConnectionStatus} />

      <section className="p8-security-footer">
        <Bot size={17} aria-hidden="true" />
        <span>
          The bot configuration is saved in the project. The actual Telegram token is
          handled separately by the desktop secure-storage service.
        </span>
      </section>
    </div>
  );
}

export default ProjectBotSettingsPanel;