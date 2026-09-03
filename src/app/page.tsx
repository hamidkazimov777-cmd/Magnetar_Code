"use client";

import { useState } from "react";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ProviderSettings } from "@/components/providers/ProviderSettings";
import { 
  Plus, 
  Search, 
  Folder, 
  Settings, 
  User, 
  PanelLeftClose, 
  PanelLeftOpen 
} from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useChatStore } from "@/store/chat-store";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { clearChat } = useChatStore();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-sm">
      {/* Sidebar */}
      <div 
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 border-r flex flex-col bg-[#F9F9F9] dark:bg-muted/10 overflow-hidden shrink-0`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <img src="/logo.png" alt="Magnetar Logo" className="w-6 h-6 rounded" />
            Magnetar Web
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="px-4 py-2 space-y-1">
          <button onClick={clearChat} className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-left">
            <Plus size={16} />
            <span>New Session</span>
          </button>
          <button className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-left text-muted-foreground">
            <Search size={16} />
            <span>Search</span>
          </button>
        </div>

        <div className="px-4 py-4 flex-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
            SESSIONS
            <Plus size={14} className="cursor-pointer hover:text-foreground" />
          </div>
          
          {/* Mock Folders */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md">
              <Folder size={16} />
              <span className="truncate">Magnetar</span>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md">
              <Folder size={16} />
              <span className="truncate">project LUMINA</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t space-y-1">
          <Dialog>
            <DialogTrigger className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-left text-muted-foreground">
              <Settings size={16} />
              <span>Settings</span>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <ProviderSettings />
            </DialogContent>
          </Dialog>
          
          <button className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-left text-muted-foreground">
            <User size={16} />
            <span>Profile</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-white dark:bg-background">
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="absolute top-4 left-4 z-10 text-muted-foreground hover:text-foreground bg-background/50 p-1 rounded-md backdrop-blur-sm"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <ChatContainer />
      </div>
    </div>
  );
}
