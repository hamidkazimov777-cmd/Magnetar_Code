import { ProviderSettings } from "@/components/providers/ProviderSettings";
import { ChatContainer } from "@/components/chat/ChatContainer";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8">
      <div className="z-10 w-full max-w-7xl font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4 text-center">Magnetar Web UI</h1>
        <p className="text-center mb-8 text-muted-foreground">
          Next-generation self-hosted AI Workspace
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 border-r pr-6 border-border">
            <ProviderSettings />
          </div>
          <div className="col-span-1 md:col-span-2">
            <ChatContainer />
          </div>
        </div>
      </div>
    </main>
  );
}
