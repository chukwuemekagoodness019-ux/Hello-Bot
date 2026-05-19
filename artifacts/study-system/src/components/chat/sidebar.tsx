import { Button } from "@/components/ui/button";
import { MessageSquare, Settings, X, Crown, Plus } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useChatHistory } from "@/hooks/use-chat-history";

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
  const { data: user } = useGetMe();
  const paymentModal = usePaymentModal();
  const { conversations, currentId, setCurrentId, startNewChat } = useChatHistory();

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border md:hidden">
        <span className="font-semibold text-primary">AI Study System</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-sidebar-foreground/70">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4">
        <Button 
          className="w-full justify-start gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 shadow-sm"
          onClick={() => {
            startNewChat();
            if (onClose) onClose();
          }}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scroll-smooth">
        <div className="px-2 py-1.5 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2">
          History
        </div>
        
        {conversations.length === 0 ? (
          <div className="px-3 py-4 text-sm text-sidebar-foreground/40 text-center italic">
            No previous chats
          </div>
        ) : (
          conversations.map(conv => (
            <button 
              key={conv.id}
              onClick={() => {
                setCurrentId(conv.id);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors text-left group
                ${currentId === conv.id 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                  : "hover:bg-sidebar-accent/50 text-sidebar-foreground/70"
                }`}
            >
              <MessageSquare className={`w-4 h-4 shrink-0 ${currentId === conv.id ? "text-primary" : "opacity-50"}`} />
              <span className="truncate">{conv.title}</span>
            </button>
          ))
        )}
      </div>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/20 space-y-4">
        {user && !user.isPremium && (
          <div className="p-4 bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Free Plan</span>
              </div>
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-sidebar-foreground/60 uppercase tracking-wider">
                  <span>Msgs Today</span>
                  <span>{user.limits.messagesUsed} / {user.limits.messagesLimit}</span>
                </div>
                <div className="w-full bg-sidebar-border h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (user.limits.messagesUsed / Math.max(1, user.limits.messagesLimit)) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-sidebar-foreground/60 uppercase tracking-wider">
                  <span>Quizzes Today</span>
                  <span>{user.limits.quizzesUsed} / {user.limits.quizzesLimit}</span>
                </div>
                <div className="w-full bg-sidebar-border h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary/60 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (user.limits.quizzesUsed / Math.max(1, user.limits.quizzesLimit)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            
            <Button 
              size="sm" 
              className="w-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
              onClick={() => paymentModal.open()}
            >
              Unlock Premium
            </Button>
          </div>
        )}
        
        {user?.isPremium && (
          <div className="p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/20 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-5 h-5 text-yellow-500" />
              <span className="font-bold text-yellow-500">Premium Active</span>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-2">Unlimited messages, quizzes, and voice enabled.</p>
          </div>
        )}
      </div>
    </div>
  );
}