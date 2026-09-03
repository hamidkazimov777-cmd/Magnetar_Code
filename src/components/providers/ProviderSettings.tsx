"use client";

import { useState } from "react";
import { useProviderStore } from "@/store/provider-store";
import { ProviderConfig } from "@/core/providers/types";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProviderSettings() {
  const { providers, addProvider, removeProvider, activeProviderId, setActiveProvider } = useProviderStore();
  
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");
  
  const handleAdd = () => {
    if (!name || !baseUrl || !apiKey) return;
    
    const newProvider: ProviderConfig = {
      id: uuidv4(),
      name,
      baseUrl,
      apiKey,
      type: "custom",
      defaultModel
    };
    
    addProvider(newProvider);
    
    // Reset form
    setName("");
    setApiKey("");
  };

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Add Custom Provider</CardTitle>
          <CardDescription>Configure a new AI API provider (OpenAI-compatible).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="e.g. My Local LM Studio" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input id="baseUrl" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (BYOK)</Label>
            <Input id="apiKey" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Default Model</Label>
            <Input id="model" placeholder="gpt-4o-mini" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleAdd}>Save Provider</Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-medium">Saved Providers</h3>
        {providers.length === 0 && <p className="text-sm text-muted-foreground">No providers added yet.</p>}
        {providers.map(provider => (
          <Card key={provider.id} className={activeProviderId === provider.id ? "border-primary" : ""}>
            <CardHeader className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{provider.name}</CardTitle>
                  <CardDescription className="text-xs">{provider.baseUrl}</CardDescription>
                </div>
                <div className="space-x-2">
                  {activeProviderId !== provider.id && (
                    <Button variant="outline" size="sm" onClick={() => setActiveProvider(provider.id)}>
                      Use this
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => removeProvider(provider.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
