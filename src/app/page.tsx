import { ProviderSettings } from "@/components/providers/ProviderSettings";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 md:p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">Magnetar Web UI</h1>
        <p className="text-center mb-12 text-muted-foreground">
          Next-generation self-hosted AI Workspace
        </p>
        
        <ProviderSettings />
      </div>
    </main>
  );
}
