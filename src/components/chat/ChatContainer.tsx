"use client";

import { useState } from "react";
import { useProviderStore } from "@/store/provider-store";
import { useChatStore } from "@/store/chat-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ChatContainer() {
  const [input, setInput] = useState("");
  const { messages, isGenerating, addMessage, appendChunkToLastMessage, setGenerating, clearChat } = useChatStore();
  const { activeProviderId, getProviderInstance, providers } = useProviderStore();

  const handleSend = async () => {
    if (!input.trim() || !activeProviderId) return;

    const userMessage = input;
    setInput("");
    
    // Add User message
    addMessage({ role: "user", content: userMessage });
    
    const provider = getProviderInstance(activeProviderId);
    if (!provider) return;

    const config = providers.find(p => p.id === activeProviderId);
    if (!config) return;

    // Add Empty Assistant message for streaming
    addMessage({ role: "assistant", content: "" });
    setGenerating(true);

    try {
      // Create request messages ignoring UI specific fields
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeProvider = providers.find(p => p.id === activeProviderId);

  return (
    <Card className="w-full max-w-4xl mx-auto h-[700px] flex flex-col">
      <CardHeader className="border-b flex flex-row items-center justify-between">
        <CardTitle>Chat {activeProvider ? `via ${activeProvider.name}` : '(No Provider Selected)'}</CardTitle>
        <Button variant="outline" size="sm" onClick={clearChat}>Clear</Button>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            {activeProviderId ? "Send a message to start chat." : "Please add and select a provider first."}
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-muted max-w-[80%] rounded-lg p-3 flex gap-1">
              <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-.3s]" />
              <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-.5s]" />
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="border-t p-4 flex gap-2">
        <Input 
          placeholder="Type a message..." 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!activeProviderId || isGenerating}
          className="flex-1"
        />
        <Button 
          onClick={handleSend} 
          disabled={!activeProviderId || isGenerating || !input.trim()}
        >
          Send
        </Button>
      </CardFooter>
    </Card>
  );
}
