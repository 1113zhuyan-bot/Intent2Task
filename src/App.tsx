import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MessageSquare, ListTodo, CheckCircle2, AlertCircle, Loader2, Send, Calendar as CalendarIcon, HelpCircle, ExternalLink, Bot, Edit2, Settings, Bell, Shield, Palette, Save, Trash2, Clock, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractTasksFromChat } from "@/lib/gemini";
import { Task, ExtractedTask, Priority, AppSettings } from "@/types";
import { format, isToday, isYesterday, isTomorrow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export default function App() {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem("intent2task_tasks");
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState("input");
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [editingTask, setEditingTask] = useState<{ task: ExtractedTask; index: number } | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("intent2task_settings");
    const defaultSettings: AppSettings = {
      notifications: { popup: true, reminderOffset: 30 },
      priorityRules: { autoAssign: true, defaultPriority: "medium" },
      theme: { primaryColor: "#3370ff" }
    };
    if (!saved) return defaultSettings;
    try {
      const parsed = JSON.parse(saved);
      // Migration: if old settings exist, convert to new format
      if (parsed.notifications) {
        if (typeof parsed.notifications.popup === 'undefined') {
          parsed.notifications.popup = true;
        }
        if (typeof parsed.notifications.reminderOffset === 'undefined') {
          parsed.notifications.reminderOffset = 30;
        }
      }
      return parsed;
    } catch {
      return defaultSettings;
    }
  });

  const [activeNotification, setActiveNotification] = useState<Task | null>(null);
  const [snoozedTasks, setSnoozedTasks] = useState<Record<string, number>>({});

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("intent2task_tasks", JSON.stringify(tasks));
  }, [tasks]);

  // Save settings and apply theme
  useEffect(() => {
    localStorage.setItem("intent2task_settings", JSON.stringify(settings));
    const root = document.documentElement;
    root.style.setProperty('--primary', settings.theme.primaryColor);
    // Generate a soft version (10% opacity equivalent)
    root.style.setProperty('--primary-soft', `${settings.theme.primaryColor}15`);
  }, [settings]);

  // Deadline check for popup notifications
  useEffect(() => {
    if (!settings.notifications.popup) return;

    const checkDeadlines = () => {
      const now = new Date();
      tasks.forEach(task => {
        if (task.status === 'completed' || !task.deadline) return;
        
        try {
          // Handle format "YYYY-MM-DD HH:mm"
          const deadlineStr = task.deadline.includes('T') ? task.deadline : task.deadline.replace(' ', 'T');
          const deadlineDate = new Date(deadlineStr);
          const diffMinutes = (deadlineDate.getTime() - now.getTime()) / (1000 * 60);
          
          // Notify if deadline is within user-defined offset and hasn't been notified yet
          // We use a key that includes the deadline string to ensure that if the deadline changes,
          // the notification can be triggered again.
          if (diffMinutes > 0 && diffMinutes <= settings.notifications.reminderOffset) {
            const notifiedKey = `notified_${task.id}_${task.deadline}`;
            const isSnoozed = snoozedTasks[task.id] && now.getTime() < snoozedTasks[task.id];
            
            if (!sessionStorage.getItem(notifiedKey) && !isSnoozed) {
              setActiveNotification(task);
              sessionStorage.setItem(notifiedKey, 'true');
            }
          }
        } catch (e) {
          console.error("Invalid date format", task.deadline);
        }
      });
    };

    const interval = setInterval(checkDeadlines, 30000); // Check every 30s
    checkDeadlines(); // Initial check
    return () => clearInterval(interval);
  }, [tasks, settings.notifications.popup, settings.notifications.reminderOffset, snoozedTasks]);

  const handleExtract = async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    try {
      const result = await extractTasksFromChat(input);
      setExtractedTasks(result);
      setActiveTab("confirm");
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const groupedTasks = useMemo(() => {
    const groups = tasks.reduce((acc, task) => {
      const dateKey = task.deadline ? task.deadline.split(' ')[0] : "待定";
      if (!acc[dateKey]) {
        acc[dateKey] = { pending: [], completed: [] };
      }
      if (task.status === "completed") {
        acc[dateKey].completed.push(task);
      } else {
        acc[dateKey].pending.push(task);
      }
      return acc;
    }, {} as Record<string, { pending: Task[], completed: Task[] }>);

    const priorityMap = { high: 3, medium: 2, low: 1 };
    const sortFn = (a: Task, b: Task) => {
      // Always group by status first: pending (confirmed/pending) before completed
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;

      if (sortBy === "priority") {
        const pDiff = priorityMap[b.priority] - priorityMap[a.priority];
        if (pDiff !== 0) return pDiff;
        // If priority is same, sort by time
        if (a.deadline && b.deadline) {
          return new Date(a.deadline.replace(' ', 'T')).getTime() - new Date(b.deadline.replace(' ', 'T')).getTime();
        }
      } else {
        // Time sorting
        if (a.deadline && b.deadline) {
          const tDiff = new Date(a.deadline.replace(' ', 'T')).getTime() - new Date(b.deadline.replace(' ', 'T')).getTime();
          if (tDiff !== 0) return tDiff;
        } else if (a.deadline) {
          return -1;
        } else if (b.deadline) {
          return 1;
        }
      }
      // Fallback to creation time
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    };

    Object.keys(groups).forEach(date => {
      groups[date].pending.sort(sortFn);
      groups[date].completed.sort(sortFn);
    });

    return groups;
  }, [tasks, sortBy]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedTasks).sort((a, b) => {
      if (a === "待定") return 1;
      if (b === "待定") return -1;
      
      const dateA = new Date(a);
      const dateB = new Date(b);
      
      const isDateA = !isNaN(dateA.getTime());
      const isDateB = !isNaN(dateB.getTime());
      
      if (isDateA && isDateB) {
        return dateA.getTime() - dateB.getTime();
      }
      if (isDateA) return -1;
      if (isDateB) return 1;
      
      return a.localeCompare(b);
    });
  }, [groupedTasks]);

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === "待定") return { label: "待定", sub: "无截止日期" };
    
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const weekDay = format(date, "EEEE", { locale: zhCN });
      const dateText = format(date, "M月d日");
      
      if (isToday(date)) return { label: "今天", sub: `${weekDay} · ${dateText}` };
      if (isTomorrow(date)) return { label: "明天", sub: `${weekDay} · ${dateText}` };
      if (isYesterday(date)) return { label: "昨天", sub: `${weekDay} · ${dateText}` };
      return { label: dateText, sub: weekDay };
    }
    
    return { label: dateStr, sub: "截止日期" };
  };

  const confirmTask = (extracted: ExtractedTask, index: number) => {
    const newTask: Task = {
      id: Math.random().toString(36).substring(7),
      ...extracted,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    setTasks([newTask, ...tasks]);
    setExtractedTasks(extractedTasks.filter((_, i) => i !== index));
    if (extractedTasks.length === 1) {
      setActiveTab("list");
    }
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(tasks.map(t => 
      t.id === id ? { ...t, status: t.status === "completed" ? "confirmed" : "completed" } : t
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const saveEditedTask = () => {
    if (!editingTask) return;
    
    // If we are editing an extracted task (from AI suggestions)
    if (activeTab === "confirm") {
      const updatedExtracted = [...extractedTasks];
      updatedExtracted[editingTask.index] = editingTask.task;
      setExtractedTasks(updatedExtracted);
    } else {
      // If we are editing an existing task in the main list
      const updatedTasks = tasks.map((t, i) => 
        i === editingTask.index ? { ...editingTask.task, id: t.id, createdAt: t.createdAt } : t
      );
      setTasks(updatedTasks as Task[]);
    }
    
    setEditingTask(null);
  };

  const handleSnooze = () => {
    if (!activeNotification) return;
    
    // Set snooze time to 5 minutes from now
    const snoozeUntil = Date.now() + 5 * 60 * 1000;
    setSnoozedTasks(prev => ({
      ...prev,
      [activeNotification.id]: snoozeUntil
    }));
    
    // Clear the notified flag in sessionStorage so it can be re-triggered
    const notifiedKey = `notified_${activeNotification.id}_${activeNotification.deadline}`;
    sessionStorage.removeItem(notifiedKey);
    
    setActiveNotification(null);
  };

  const getPriorityStyles = (priority: Priority) => {
    switch (priority) {
      case "high": return "bg-[#fee2e2] text-urgent";
      case "medium": return "bg-[#fff7ed] text-warning";
      case "low": return "bg-[#edf2ff] text-primary";
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-[#f5f7f9] to-[#eef2f7]">
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-border-base flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/20">
            i2t
          </div>
          <h1 className="font-bold text-xl text-text-main tracking-tight">Intent2Task</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 rounded-full border border-success/20">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[12px] font-bold text-success uppercase tracking-wider">AI 引擎就绪</span>
          </div>
          <Dialog>
            <DialogTrigger render={<Button variant="ghost" size="icon" className="rounded-full w-8 h-8" />}>
              <HelpCircle className="w-5 h-5 text-text-secondary" />
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>How to use Intent2Task</DialogTitle>
                <DialogDescription>
                  Turn your chat conversations into actionable tasks in seconds.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <section className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    1. Paste Chat Records
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Copy any chat log from Feishu/Lark, WeChat, Slack, or Email and paste it into the Input tab. 
                    Our AI will automatically identify task descriptions, deadlines, and priorities.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    2. Confirm Extracted Tasks
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Review the tasks identified by the AI. You can choose to add them to your list or ignore them if they are not relevant.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-600" />
                    3. Lark/Feishu Integration (Advanced)
                  </h3>
                  <div className="bg-bg-main p-4 rounded-xl space-y-2 border border-border-base">
                    <p className="text-sm font-medium">To enable automatic message syncing:</p>
                    <ol className="text-xs text-text-secondary list-decimal list-inside space-y-1">
                      <li>Create a custom bot on the Lark Open Platform.</li>
                      <li>Enable the "Message" event in the Event Subscription.</li>
                      <li>Set the Request URL to: <code className="bg-white px-1 py-0.5 rounded border">{window.location.origin}/api/lark/webhook</code></li>
                      <li>Add your App ID and App Secret to the project environment variables.</li>
                    </ol>
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="p-0 h-auto text-primary" 
                      render={
                        <a href="https://open.feishu.cn/document/home/index" target="_blank" rel="noreferrer" className="flex items-center gap-1" />
                      }
                    >
                      Lark Developer Documentation <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </section>
              </div>
            </DialogContent>
          </Dialog>
          <div className="w-8 h-8 rounded-full bg-gray-200 border border-border-base"></div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-sidebar border-r border-border-base p-6 flex flex-col gap-10">
          <div className="space-y-3">
            <div className="text-[11px] text-text-secondary uppercase px-4 mb-2 tracking-[0.2em] font-bold opacity-50">连接平台</div>
            <div className="nav-item active">
              <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(52,199,89,0.5)]" />
              飞书 (Feishu)
            </div>
            <div className="nav-item opacity-40 grayscale">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              微信 (WeChat)
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] text-text-secondary uppercase px-4 mb-2 tracking-[0.2em] font-bold opacity-50">工作台</div>
            <div 
              className={cn("nav-item", activeTab === "input" && "active")}
              onClick={() => setActiveTab("input")}
            >
              <MessageSquare className={cn("w-4 h-4", activeTab === "input" ? "text-primary" : "text-text-secondary")} />
              消息输入
            </div>
            <div 
              className={cn("nav-item", activeTab === "confirm" && "active")}
              onClick={() => setActiveTab("confirm")}
            >
              <CheckCircle2 className={cn("w-4 h-4", activeTab === "confirm" ? "text-primary" : "text-text-secondary")} />
              待确认事项
              {extractedTasks.length > 0 && (
                <span className="ml-auto bg-urgent text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {extractedTasks.length}
                </span>
              )}
            </div>
            <div 
              className={cn("nav-item", activeTab === "list" && "active")}
              onClick={() => setActiveTab("list")}
            >
              <ListTodo className={cn("w-4 h-4", activeTab === "list" ? "text-primary" : "text-text-secondary")} />
              任务看板
              {tasks.filter(t => t.status !== "completed").length > 0 && (
                <span className="ml-auto bg-primary-soft text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-primary/10">
                  {tasks.filter(t => t.status !== "completed").length}
                </span>
              )}
            </div>
          </div>

          <div className="mt-auto">
            <div 
              className={cn("nav-item text-text-secondary", activeTab === "settings" && "active")}
              onClick={() => setActiveTab("settings")}
            >
              <Settings className={cn("w-4 h-4", activeTab === "settings" ? "text-primary" : "text-text-secondary")} />
              设置
            </div>
          </div>
        </aside>

        <div className="flex-1 p-6 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel: Input/Feed */}
            <div className="panel bg-panel-input">
              <div className="panel-header">
                <div className="panel-title flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-primary rounded-full" />
                  {activeTab === "input" ? "消息输入" : "消息流 (飞书)"}
                </div>
                <span className="bg-primary/10 text-primary px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                  {activeTab === "input" ? "Manual Input" : "Live Monitoring"}
                </span>
              </div>
              <div className="flex-1 p-5 overflow-y-auto">
                {activeTab === "input" ? (
                  <div className="h-full flex flex-col gap-4">
                    <Textarea 
                      placeholder="e.g. @John Please finish the report by Friday. Also, Sarah, can you book the meeting room for next Monday?"
                      className="flex-1 resize-none border-border-base focus-visible:ring-primary text-sm leading-relaxed p-4 rounded-xl"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button 
                        onClick={handleExtract} 
                        disabled={isProcessing || !input.trim()}
                        className="bg-primary hover:bg-primary/90 text-white px-6 h-10 gap-2 rounded-lg transition-all"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            分析中...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            提取任务
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="chat-msg">
                      <span className="chat-msg-meta">张项目 (产品部) 14:05</span>
                      @李设计，刚才讨论的网页版 Demo 麻烦周五下班前发我一下，重点看下任务确认流程。
                    </div>
                    <div className="chat-msg">
                      <span className="chat-msg-meta">王经理 (研发组) 14:12</span>
                      @所有人 记得明天上午10点在 302 会议室开周会，我们需要讨论 Intent2Task 的集成文档。
                    </div>
                    <div className="chat-msg">
                      <span className="chat-msg-meta">系统通知 14:20</span>
                      客户 A 的反馈已经整理好，请陈小明在今天内回复邮件确认需求。
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: AI Suggestions / Task List */}
            <div className="panel bg-panel-tasks">
              <div className="panel-header">
                <div className="panel-title flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-primary rounded-full" />
                  {activeTab === "confirm" ? "AI 提取建议" : 
                   activeTab === "settings" ? "系统设置" : "任务看板"}
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === "list" && tasks.length > 0 && (
                    <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-border-base/50 mr-2">
                      <button
                        onClick={() => setSortBy("time")}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all",
                          sortBy === "time" ? "bg-white text-primary shadow-sm" : "text-text-secondary hover:text-text-main"
                        )}
                      >
                        <Clock className="w-3 h-3" />
                        时间
                      </button>
                      <button
                        onClick={() => setSortBy("priority")}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all",
                          sortBy === "priority" ? "bg-white text-primary shadow-sm" : "text-text-secondary hover:text-text-main"
                        )}
                      >
                        <ArrowUpDown className="w-3 h-3" />
                        优先级
                      </button>
                    </div>
                  )}
                  {activeTab === "confirm" && extractedTasks.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-primary hover:text-primary/80 h-8 text-xs font-bold bg-primary/5 hover:bg-primary/10 rounded-lg px-3"
                      onClick={() => {
                        extractedTasks.forEach((t, i) => confirmTask(t, i));
                      }}
                    >
                      全部确认
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {activeTab === "settings" ? (
                  <div className="p-8 space-y-10 max-w-2xl mx-auto">
                    {/* Notifications Section */}
                    <section className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-text-main">
                        <Bell className="w-4 h-4 text-primary" />
                        通知提醒方式
                      </div>
                      <div className="p-6 rounded-2xl border border-border-base bg-white/50 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">
                              🔔
                            </div>
                            <div className="space-y-1">
                              <div className="text-sm font-bold">应用内弹窗通知</div>
                              <div className="text-xs text-text-secondary">当任务截止时间临近时，在页面中心显示提醒弹窗</div>
                            </div>
                          </div>
                          <div 
                            onClick={() => setSettings({
                              ...settings,
                              notifications: { ...settings.notifications, popup: !settings.notifications.popup }
                            })}
                            className={cn(
                              "w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300",
                              settings.notifications.popup ? "bg-primary" : "bg-gray-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                              settings.notifications.popup ? "left-7" : "left-1"
                            )} />
                          </div>
                        </div>

                        {settings.notifications.popup && (
                          <div className="pt-4 border-t border-border-base/40 space-y-3">
                            <label className="text-xs font-bold text-text-secondary">提醒时间设置</label>
                            <div className="grid grid-cols-4 gap-2">
                              {[15, 30, 60, 120].map((offset) => (
                                <button
                                  key={offset}
                                  onClick={() => setSettings({
                                    ...settings,
                                    notifications: { ...settings.notifications, reminderOffset: offset }
                                  })}
                                  className={cn(
                                    "py-2 rounded-lg text-xs font-bold transition-all",
                                    settings.notifications.reminderOffset === offset
                                      ? "bg-primary text-white shadow-md shadow-primary/20"
                                      : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                                  )}
                                >
                                  提前 {offset >= 60 ? `${offset / 60}小时` : `${offset}分钟`}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Priority Rules Section */}
                    <section className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-text-main">
                        <Shield className="w-4 h-4 text-warning" />
                        任务优先级规则
                      </div>
                      <div className="p-6 rounded-2xl border border-border-base space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">自动分配优先级</div>
                            <div className="text-xs text-text-secondary">AI 根据语义自动判断任务紧急程度</div>
                          </div>
                          <Button 
                            variant={settings.priorityRules.autoAssign ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSettings({
                              ...settings,
                              priorityRules: { ...settings.priorityRules, autoAssign: !settings.priorityRules.autoAssign }
                            })}
                          >
                            {settings.priorityRules.autoAssign ? "已开启" : "已关闭"}
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <label className="text-xs font-medium text-text-secondary">默认优先级</label>
                          <div className="flex gap-2">
                            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => setSettings({
                                  ...settings,
                                  priorityRules: { ...settings.priorityRules, defaultPriority: p }
                                })}
                                className={cn(
                                  "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                                  settings.priorityRules.defaultPriority === p 
                                    ? getPriorityStyles(p) + " ring-2 ring-offset-1 ring-current"
                                    : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                                )}
                              >
                                {p === 'low' ? '低' : p === 'medium' ? '中' : '高'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Theme Section */}
                    <section className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-text-main">
                        <Palette className="w-4 h-4 text-accent-violet" />
                        主题配色
                      </div>
                      <div className="p-6 rounded-2xl border border-border-base bg-white/50">
                        <div className="grid grid-cols-5 gap-6">
                          {[
                            { name: '天空蓝', color: '#60a5fa' },
                            { name: '珊瑚橙', color: '#fb923c' },
                            { name: '薰衣草', color: '#818cf8' },
                            { name: '薄荷绿', color: '#34d399' },
                            { name: '浅岩灰', color: '#94a3b8' }
                          ].map((theme) => (
                            <div 
                              key={theme.color}
                              onClick={() => setSettings({
                                ...settings,
                                theme: { primaryColor: theme.color }
                              })}
                              className="flex flex-col items-center gap-3 cursor-pointer group"
                            >
                              <div 
                                className={cn(
                                  "w-12 h-12 rounded-2xl transition-all duration-300 flex items-center justify-center",
                                  settings.theme.primaryColor === theme.color 
                                    ? "ring-4 ring-offset-2 shadow-lg scale-110" 
                                    : "hover:scale-105 shadow-sm"
                                )}
                                style={{ 
                                  backgroundColor: theme.color,
                                  // @ts-ignore
                                  "--ring-color": theme.color 
                                }}
                              >
                                {settings.theme.primaryColor === theme.color && (
                                  <CheckCircle2 className="w-6 h-6 text-white" />
                                )}
                              </div>
                              <span className={cn(
                                "text-[11px] font-bold transition-colors",
                                settings.theme.primaryColor === theme.color ? "text-text-main" : "text-text-secondary"
                              )}>
                                {theme.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <div className="pt-6 border-t border-border-base flex justify-end">
                      <Button className="gap-2 bg-primary text-white" onClick={() => setActiveTab("list")}>
                        <Save className="w-4 h-4" />
                        保存并返回
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5">
                    <AnimatePresence mode="popLayout">
                      {activeTab === "confirm" ? (
                    <div className="space-y-3">
                      {extractedTasks.map((task, index) => (
                        <motion.div
                          key={index}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="task-card group relative"
                        >
                          <div 
                            className="cursor-pointer"
                            onClick={() => setEditingTask({ task: { ...task }, index })}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="text-[15px] font-bold text-text-main group-hover:text-primary transition-colors">{task.title}</div>
                              <span className={cn("priority-badge", getPriorityStyles(task.priority))}>
                                {task.priority}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-[13px] text-text-secondary leading-relaxed mb-3 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex gap-4 text-[11px] text-text-secondary mb-4">
                              {task.deadline && (
                                <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">
                                  <CalendarIcon className="w-3 h-3" />
                                  截止: {task.deadline}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between pt-3 border-t border-border-base/40">
                            <div className="flex gap-2">
                              <Button 
                                size="sm"
                                onClick={() => confirmTask(task, index)}
                                className="bg-primary hover:bg-primary/90 text-white h-8 px-4 rounded-lg text-xs font-bold"
                              >
                                确认加入
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setExtractedTasks(extractedTasks.filter((_, i) => i !== index))}
                                className="h-8 px-3 rounded-lg text-xs text-text-secondary hover:text-urgent hover:bg-urgent/5"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                忽略
                              </Button>
                            </div>
                            <div className="text-[10px] text-text-secondary italic opacity-0 group-hover:opacity-100 transition-opacity">
                              点击卡片可编辑详情
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {extractedTasks.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-text-secondary py-20">
                          <CheckCircle2 className="w-10 h-10 mb-3 opacity-20" />
                          <p className="text-sm">暂无待确认事项</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-10 p-1">
                      {sortedDates.map(date => {
                        const { label, sub } = formatDateHeader(date);
                        const totalCount = groupedTasks[date].pending.length + groupedTasks[date].completed.length;
                        
                        return (
                          <div key={date} className="space-y-6">
                            <div className="sticky top-0 z-10 bg-panel-tasks/80 backdrop-blur-md py-3 -mx-2 px-2 flex items-end justify-between border-b border-border-base/20">
                              <div className="flex items-baseline gap-3">
                                <h3 className="text-2xl font-black text-text-main tracking-tight">
                                  {label}
                                </h3>
                                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest opacity-60">
                                  {sub}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                                <ListTodo className="w-3 h-3" />
                                {totalCount} 项任务
                              </div>
                            </div>

                            {/* Pending Tasks */}
                            {groupedTasks[date].pending.length > 0 && (
                              <div className="space-y-3">
                                {groupedTasks[date].pending.map((task) => (
                                  <motion.div
                                    key={task.id}
                                    layout
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="task-card group"
                                  >
                                    <div className="flex items-start gap-3">
                                      <button 
                                        onClick={() => toggleTaskStatus(task.id)}
                                        className="mt-1 w-5 h-5 rounded-full border border-border-base hover:border-primary flex items-center justify-center transition-colors bg-white shadow-sm"
                                      >
                                        {task.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                                      </button>
                                      <div 
                                        className="flex-1 min-w-0 cursor-pointer group/title"
                                        onClick={() => setEditingTask({ task: { ...task }, index: tasks.findIndex(t => t.id === task.id) })}
                                      >
                                        <div className="flex justify-between items-start mb-1.5">
                                          <div className="text-[14px] font-bold text-text-main group-hover/title:text-primary transition-colors truncate">
                                            {task.title}
                                          </div>
                                          <span className={cn("priority-badge scale-90 origin-right", getPriorityStyles(task.priority))}>
                                            {task.priority}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-text-secondary flex gap-3 items-center">
                                          {task.deadline && (
                                            <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-border-base/30">
                                              <CalendarIcon className="w-2.5 h-2.5" />
                                              {task.deadline.includes(' ') ? task.deadline.split(' ')[1] : task.deadline}
                                            </span>
                                          )}
                                          <span className="opacity-60">{format(new Date(task.createdAt), "HH:mm")}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => deleteTask(task.id)}
                                          className="w-8 h-8 text-text-secondary hover:text-urgent hover:bg-urgent/5 rounded-full"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            )}

                            {/* Completed Tasks */}
                            {groupedTasks[date].completed.length > 0 && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider opacity-40">已完成</span>
                                  <div className="h-[1px] flex-1 bg-border-base/20" />
                                </div>
                                {groupedTasks[date].completed.map((task) => (
                                  <motion.div
                                    key={task.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="task-card group opacity-40 grayscale-[0.5]"
                                  >
                                    <div className="flex items-start gap-3">
                                      <button 
                                        onClick={() => toggleTaskStatus(task.id)}
                                        className="mt-1 w-5 h-5 rounded-full border bg-success border-success text-white flex items-center justify-center transition-colors"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                      </button>
                                      <div 
                                        className="flex-1 min-w-0 cursor-pointer group/title"
                                        onClick={() => setEditingTask({ task: { ...task }, index: tasks.findIndex(t => t.id === task.id) })}
                                      >
                                        <div className="flex justify-between items-start mb-1.5">
                                          <div className="text-[14px] font-bold text-text-main group-hover/title:text-primary transition-colors truncate line-through opacity-60">
                                            {task.title}
                                          </div>
                                          <span className={cn("priority-badge scale-90 origin-right", getPriorityStyles(task.priority))}>
                                            {task.priority}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-text-secondary flex gap-3 items-center">
                                          {task.deadline && (
                                            <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-border-base/30">
                                              <CalendarIcon className="w-2.5 h-2.5" />
                                              {task.deadline.includes(' ') ? task.deadline.split(' ')[1] : task.deadline}
                                            </span>
                                          )}
                                          <span className="opacity-60">{format(new Date(task.createdAt), "HH:mm")}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => deleteTask(task.id)}
                                          className="w-8 h-8 text-text-secondary hover:text-urgent hover:bg-urgent/5 rounded-full"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {tasks.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-text-secondary py-20">
                          <ListTodo className="w-10 h-10 mb-3 opacity-20" />
                          <p className="text-sm">任务列表为空</p>
                        </div>
                      )}
                    </div>
                  )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="h-8 bg-white border-t border-border-base flex items-center px-6 text-[11px] text-text-secondary flex-shrink-0">
        已连接 1 个平台 • 今日已自动识别 {tasks.length} 项任务 • 最后同步时间: {format(new Date(), "HH:mm:ss")}
      </footer>

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑任务详情</DialogTitle>
            <DialogDescription>
              在确认加入待办列表前，您可以手动调整 AI 提取的信息。
            </DialogDescription>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-secondary">任务名称</label>
                <Input 
                  value={editingTask.task.title}
                  onChange={(e) => setEditingTask({
                    ...editingTask,
                    task: { ...editingTask.task, title: e.target.value }
                  })}
                  className="border-border-base focus-visible:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-secondary">任务描述</label>
                <Textarea 
                  value={editingTask.task.description || ""}
                  onChange={(e) => setEditingTask({
                    ...editingTask,
                    task: { ...editingTask.task, description: e.target.value }
                  })}
                  className="border-border-base focus-visible:ring-primary min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-secondary">截止时间</label>
                  <Input 
                    type="datetime-local"
                    value={editingTask.task.deadline ? editingTask.task.deadline.replace(" ", "T") : ""}
                    onChange={(e) => setEditingTask({
                      ...editingTask,
                      task: { ...editingTask.task, deadline: e.target.value.replace("T", " ") }
                    })}
                    className="border-border-base focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-secondary">优先级</label>
                  <select 
                    value={editingTask.task.priority}
                    onChange={(e) => setEditingTask({
                      ...editingTask,
                      task: { ...editingTask.task, priority: e.target.value as Priority }
                    })}
                    className="h-8 w-full min-w-0 rounded-lg border border-border-base bg-white px-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="low">低 (Low)</option>
                    <option value="medium">中 (Medium)</option>
                    <option value="high">高 (High)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingTask(null)}>取消</Button>
                <Button onClick={saveEditedTask} className="bg-primary text-white">保存修改</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deadline Notification Popup */}
      <Dialog open={!!activeNotification} onOpenChange={(open) => !open && setActiveNotification(null)}>
        <DialogContent className="max-w-sm border-t-4 border-t-warning">
          <DialogHeader>
            <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center mb-4 mx-auto">
              <Bell className="w-6 h-6 text-warning animate-bounce" />
            </div>
            <DialogTitle className="text-center text-lg">任务截止提醒</DialogTitle>
            <DialogDescription className="text-center pt-2">
              您的任务 <span className="font-bold text-text-main">"{activeNotification?.title}"</span> 即将到期！
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 p-4 rounded-xl mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">截止时间</span>
              <span className="font-bold">{activeNotification?.deadline}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">优先级</span>
              <span className={cn("font-bold", activeNotification?.priority === 'high' ? 'text-urgent' : 'text-primary')}>
                {activeNotification?.priority === 'high' ? '高' : activeNotification?.priority === 'medium' ? '中' : '低'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-6">
            <Button className="w-full bg-primary text-white" onClick={() => {
              if (activeNotification) toggleTaskStatus(activeNotification.id);
              setActiveNotification(null);
            }}>
              标记为已完成
            </Button>
            <Button variant="ghost" className="w-full text-text-secondary" onClick={handleSnooze}>
              稍后提醒 (5分钟后)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
