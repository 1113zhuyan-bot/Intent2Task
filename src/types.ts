export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: Priority;
  status: "pending" | "confirmed" | "completed";
  source?: string;
  createdAt: string;
}

export interface ExtractedTask {
  title: string;
  description?: string;
  deadline?: string;
  priority: Priority;
}

export interface AppSettings {
  notifications: {
    popup: boolean;
    reminderOffset: number; // minutes before deadline
  };
  priorityRules: {
    autoAssign: boolean;
    defaultPriority: Priority;
  };
  theme: {
    primaryColor: string;
  };
}
