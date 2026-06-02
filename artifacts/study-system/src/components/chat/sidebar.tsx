import { Button } from "@/components/ui/button";
import { MessageSquare, X, Crown, Plus } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useChatHistory } from "@/hooks/use-chat-history";

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
  const { data: user } = useGetMe();
  const paymentModal = usePaymentModal();
  const { conversations, currentId, setCurrentId, startNewChat } = useChatHistory();

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-4 flex items-center justify-between border-b border-white/8 md:hidden">
        <span className="font-semibold text-primary tracking-tight">AI Study System</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4">
        <Button
          className="w-full justify-start gap-2 bg-primary hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/30 transition-all duration-150"
          onClick={() => {
            startNewChat();
            if (onClose) onClose();
          }}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scroll-touch">
        <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
          History
        </div>

        {conversations.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500 text-center italic">
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all duration-150 text-left group ${
                currentId === conv.id
                  ? "bg-primary/15 text-white font-medium ring-1 ring-primary/25"
                  : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare className={`w-4 h-4 shrink-0 ${currentId === conv.id ? "text-primary" : "opacity-40"}`} />
              <span className="truncate">{conv.title}</span>
            </button>
          ))
        )}
      </div>

      <div className="p-4 border-t border-white/8 space-y-4">
        {user && !user.isPremium && (
          <div className="p-4 glass border border-primary/20 rounded-xl shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Free Plan</span>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  <span>Msgs Today</span>
                  <span>{user.limits.messagesUsed} / {user.limits.messagesLimit}</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="progress-fill-premium h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (user.limits.messagesUsed / Math.max(1, user.limits.messagesLimit)) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  <span>Quizzes Today</span>
                  <span>{user.limits.quizzesUsed} / {user.limits.quizzesLimit}</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="progress-fill-premium h-full rounded-full transition-all duration-500 opacity-70"
                    style={{ width: `${Math.min(100, (user.limits.quizzesUsed / Math.max(1, user.limits.quizzesLimit)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <Button
              size="sm"
              className="w-full text-xs font-semibold bg-primary hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/30 transition-all duration-150"
              onClick={() => paymentModal.open()}
            >
              Unlock Premium
            </Button>
          </div>
        )}

        {user?.isPremium && (
          <div className="p-4 glass-premium border border-primary/25 rounded-xl shadow-lg ring-premium">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-5 h-5 text-indigo-400" />
              <span className="font-bold text-gradient-premium">Premium Active</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">Unlimited messages, quizzes, and voice enabled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
