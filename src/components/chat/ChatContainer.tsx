"use client";

import { useState, useRef, useEffect } from "react";
import { useProviderStore } from "@/store/provider-store";
import { useChatStore } from "@/store/chat-store";
import { Button } from "@/components/ui/button";
import { ArrowUp, Paperclip } from "lucide-react";

export function ChatContainer() {
  const [input, setInput] = useState("");
  const { messages, isGenerating, addMessage, appendChunkToLastMessage, setGenerating } = useChatStore();
  const { activeProviderId, getProviderInstance, providers } = useProviderStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  const handleSend = async () => {
    if (!input.trim() || !activeProviderId) return;

    const userMessage = input;
    setInput("");
    
    addMessage({ role: "user", content: userMessage });
    
    const provider = getProviderInstance(activeProviderId);
    const config = providers.find(p => p.id === activeProviderId);
    if (!provider || !config) return;

    addMessage({ role: "assistant", content: "" });
    setGenerating(true);

    try {
      const requestMessages = messages.concat({ role: "user", content: userMessage, id: "temp", createdAt: 0 }).map(m => ({
        role: m.role,
        content: m.content
      }));

      const stream = provider.streamChat({
        model: config.defaultModel || "gpt-3.5-turbo",
        messages: requestMessages
      });

      for await (const chunk of stream) {
        appendChunkToLastMessage(chunk);
      }
    } catch (error) {
      console.error("Chat error:", error);
      appendChunkToLastMessage("\n\n[Error: Connection failed. Check API Key or Base URL.]");
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-6">
            <div className="flex flex-col items-center">
              <img src="/logo.png" alt="Magnetar Logo" className="w-32 h-32 mb-4 opacity-80" />
              <h2 className="text-3xl font-bold tracking-widest text-foreground/80">MAGNETAR</h2>
            </div>
            <p className="text-muted-foreground text-sm">
              No messages yet — type below to start the conversation
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col">
                <div className="font-semibold mb-1 text-xs text-muted-foreground">
                  {msg.role === 'user' ? 'You' : 'Magnetar'}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex flex-col">
                <div className="font-semibold mb-1 text-xs text-muted-foreground">Magnetar</div>
                <div className="flex items-center gap-1 mt-2">
                  <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:-.3s]" />
                  <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:-.5s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Input Area */}
      <div className="p-4 w-full max-w-3xl mx-auto pb-8">
        <div className="relative rounded-2xl border shadow-sm bg-white dark:bg-muted/10 focus-within:ring-1 focus-within:ring-primary/50 transition-all p-3">
          <textarea 
            placeholder="Type a message..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!activeProviderId || isGenerating}
            className="w-full min-h-[60px] max-h-[200px] resize-none bg-transparent outline-none placeholder:text-muted-foreground text-sm"
            rows={2}
          />
          <div className="flex items-center justify-between mt-2 text-muted-foreground">
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5">
                <Paperclip size={16} />
              </Button>
            </div>
            <Button 
              size="icon"
              className={`h-8 w-8 rounded-full ${input.trim() ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80' : 'bg-muted text-muted-foreground'}`}
              onClick={handleSend} 
              disabled={!activeProviderId || isGenerating || !input.trim()}
            >
              <ArrowUp size={16} />
            </Button>
          </div>
        </div>
        {!activeProviderId && (
          <p className="text-xs text-center text-destructive mt-3 font-medium">
            Please select or configure an AI Provider in Settings (bottom left) before chatting.
          </p>
        )}
      </div>
    </div>
  );
}
